"""MOTION FROM A VIDEO, LOCALLY (15 Oct 2026, the Lyfta pilot, step 2).

MediaPipe's heavy PoseLandmarker reads a reference lift frame by frame and
writes the 33 body landmarks in metres (world coordinates, hips at origin),
plus an overlay contact sheet so the tracking is JUDGED, not assumed.

    python tools/anatomy/pose_from_video.py VIDEO --out DIR \\
        [--model ~/.cache/nova-anatomy/models/pose_landmarker_heavy.task]

Needs mediapipe + opencv (a py3.12 venv: py3.14 has no mediapipe wheel).
The reference videos stay in ~/.cache/nova-anatomy/refs, never in the repo:
only the derived motion is used.
"""
import argparse, json, os, sys
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--out', required=True)
ap.add_argument('--model', default=os.path.expanduser('~/.cache/nova-anatomy/models/pose_landmarker_heavy.task'))
ap.add_argument('--sheet', type=int, default=8, help='frames in the overlay sheet')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
name = os.path.splitext(os.path.basename(a.video))[0]

opts = vision.PoseLandmarkerOptions(
    base_options=mpt.BaseOptions(model_asset_path=a.model),
    running_mode=vision.RunningMode.VIDEO,
    num_poses=1,
    min_pose_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)
lm = vision.PoseLandmarker.create_from_options(opts)
cap = cv2.VideoCapture(a.video)
fps = cap.get(cv2.CAP_PROP_FPS) or 30
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
pick = set(int(i * (n - 1) / max(1, a.sheet - 1)) for i in range(a.sheet))
frames, tiles, i = [], [], 0
# the pairs MediaPipe's own drawing utils connect, for the overlay
BONES = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24),
         (23, 25), (25, 27), (27, 31), (24, 26), (26, 28), (28, 32), (0, 11), (0, 12)]
while True:
    ok, img = cap.read()
    if not ok:
        break
    ts = int(i * 1000 / fps)
    res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)), ts)
    if res.pose_world_landmarks:
        w = [[p.x, p.y, p.z, p.visibility] for p in res.pose_world_landmarks[0]]
        im = [[p.x, p.y, p.z] for p in res.pose_landmarks[0]]
        frames.append({'t': ts / 1000, 'world': w, 'image': im})
    else:
        frames.append({'t': ts / 1000, 'world': None, 'image': None})
    if i in pick:
        h, wd = img.shape[:2]
        if res.pose_landmarks:
            pts = [(int(p.x * wd), int(p.y * h)) for p in res.pose_landmarks[0]]
            for s, e in BONES:
                cv2.line(img, pts[s], pts[e], (60, 230, 255), 3)
            for p in pts[11:33]:
                cv2.circle(img, p, 4, (40, 40, 255), -1)
        tiles.append(cv2.resize(img, (320, int(320 * h / wd))))
    i += 1

tracked = sum(1 for f in frames if f['world'])
json.dump({'video': os.path.basename(a.video), 'fps': fps, 'frames': frames}, open(os.path.join(a.out, f'{name}.pose.json'), 'w'))
if tiles:
    cv2.imwrite(os.path.join(a.out, f'{name}.overlay.jpg'), cv2.hconcat(tiles))
print(f'{name}: {tracked}/{len(frames)} frames tracked at {fps:.1f} fps')
