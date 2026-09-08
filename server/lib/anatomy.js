// THE COACH'S ANATOMY — the muscles, in the detail a coach actually reasons with.
//
// His instruction, 8 Sep 2026: "Coach must have intricate expertise of all
// human muscles and anatomy that also can be demonstrated through use of this
// model." Two halves, and they must be the SAME anatomy or the Coach is
// describing one body while the figure shows another.
//
// So this file is the text form of `tools/anatomy/muscles.py` — the same
// muscles, the same groups, the same origins and insertions that built the
// mesh — with what a coach needs on top: the joint each one crosses, the
// action it produces, why a lift trains it, and the honest failure mode when
// it is weak or short. The group ids are `server/lib/muscles.js`'s closed
// list, so anything the Coach names, the model can light up.
//
// Nothing here is invented for flavour: origins and insertions follow standard
// anatomy, and where a claim is contested (the long head of the biceps and
// shoulder stability, say) it is stated as contested rather than settled.

export const ANATOMY = {
  chest: {
    label: 'Chest',
    muscles: [{
      name: 'Pectoralis major',
      heads: ['clavicular (upper)', 'sternocostal (mid)', 'abdominal (lower)'],
      origin: 'medial clavicle, sternum and the costal cartilages of ribs 1-6',
      insertion: 'lateral lip of the bicipital groove of the humerus',
      joints: ['glenohumeral'],
      actions: ['horizontal adduction', 'internal rotation', 'shoulder flexion (clavicular head)', 'shoulder extension from flexion (sternal head)'],
      trainedBy: 'any horizontal press or fly; the clavicular head takes more of an incline press, the sternocostal more of a flat or decline one',
      whenWeak: 'the press stalls off the chest and the front delt takes over — visible as the elbows flaring and the bar drifting toward the face',
    }, {
      name: 'Pectoralis minor',
      origin: 'ribs 3-5', insertion: 'coracoid process of the scapula',
      joints: ['scapulothoracic'], actions: ['scapular protraction and depression'],
      trainedBy: 'indirectly in pressing; it is a postural muscle more than a trained one',
      whenWeak: 'when SHORT rather than weak it pulls the shoulder forward — the rounded posture that makes overhead work pinch',
    }],
  },
  'front-delts': {
    label: 'Front delts',
    muscles: [{
      name: 'Deltoid, anterior head',
      origin: 'lateral third of the clavicle', insertion: 'deltoid tuberosity of the humerus',
      joints: ['glenohumeral'], actions: ['shoulder flexion', 'horizontal adduction', 'internal rotation'],
      trainedBy: 'overhead pressing and front raises; it also takes a large share of every incline press',
      whenWeak: 'rarely weak in a lifter who presses — far more often overworked relative to the rear head, which is a posture and shoulder-health problem, not a strength one',
    }],
  },
  'side-delts': {
    label: 'Side delts',
    muscles: [{
      name: 'Deltoid, lateral head',
      origin: 'acromion process', insertion: 'deltoid tuberosity of the humerus',
      joints: ['glenohumeral'], actions: ['shoulder abduction (its main job past ~15°)'],
      trainedBy: 'lateral raises and wide-grip pressing; it is the head that makes a shoulder look wide',
      whenWeak: 'the trap shrugs to help — a lateral raise that rises with the shoulder is the side delt handing the work over',
    }],
  },
  'rear-delts': {
    label: 'Rear delts',
    muscles: [{
      name: 'Deltoid, posterior head',
      origin: 'spine of the scapula', insertion: 'deltoid tuberosity of the humerus',
      joints: ['glenohumeral'], actions: ['shoulder extension', 'horizontal abduction', 'external rotation'],
      trainedBy: 'face pulls, reverse flyes, and every row where the elbow travels wide',
      whenWeak: 'the classic pressing imbalance: shoulders sit forward, and overhead work starts to pinch',
    }, {
      name: 'Infraspinatus and teres minor',
      origin: 'infraspinous fossa / lateral border of the scapula', insertion: 'greater tubercle of the humerus',
      joints: ['glenohumeral'], actions: ['external rotation', 'humeral head centring'],
      trainedBy: 'external rotation work and face pulls — small muscles, disproportionate consequences',
      whenWeak: 'the humeral head rides forward under load; this is the most common source of a shoulder that hurts on pressing',
    }],
  },
  biceps: {
    label: 'Biceps',
    muscles: [{
      name: 'Biceps brachii',
      heads: ['long (lateral)', 'short (medial)'],
      origin: 'supraglenoid tubercle (long head) and coracoid process (short head)',
      insertion: 'radial tuberosity and the bicipital aponeurosis',
      joints: ['glenohumeral', 'elbow', 'radioulnar'],
      actions: ['elbow flexion', 'forearm supination', 'weak shoulder flexion'],
      trainedBy: 'curls, and heavily in any supinated pull; because it crosses the shoulder, an incline curl (shoulder extended) lengthens the long head and a preacher curl shortens it',
      whenWeak: 'chin-ups and rows lose their finish; the elbow stops short rather than the back stopping short',
    }, {
      name: 'Brachialis',
      origin: 'distal half of the anterior humerus', insertion: 'ulnar tuberosity',
      joints: ['elbow'], actions: ['elbow flexion, in every forearm position'],
      trainedBy: 'hammer and reverse curls — it does not supinate, so a neutral grip loads it hardest',
      whenWeak: 'nothing dramatic; developing it pushes the biceps up and is the honest answer to "how do I make my arms look bigger"',
    }],
  },
  triceps: {
    label: 'Triceps',
    muscles: [{
      name: 'Triceps brachii',
      heads: ['long', 'lateral', 'medial'],
      origin: 'infraglenoid tubercle of the scapula (long head); posterior humerus (lateral and medial)',
      insertion: 'olecranon process of the ulna',
      joints: ['glenohumeral (long head only)', 'elbow'],
      actions: ['elbow extension', 'shoulder extension and adduction (long head)'],
      trainedBy: 'every press; the LONG head only gets a full stretch when the shoulder is flexed, which is why overhead extensions train what pushdowns cannot',
      whenWeak: 'the bench press stalls at lockout rather than off the chest',
    }],
  },
  forearms: {
    label: 'Forearms',
    muscles: [{
      name: 'Wrist and finger flexors',
      origin: 'medial epicondyle of the humerus', insertion: 'carpals, metacarpals and phalanges',
      joints: ['elbow', 'wrist'], actions: ['wrist flexion', 'grip'],
      trainedBy: 'every heavy pull; direct work only matters when grip is the limiter',
      whenWeak: 'the deadlift and the row end when the hands do, not when the back does — straps are a tool, not a fix',
    }, {
      name: 'Brachioradialis',
      origin: 'lateral supracondylar ridge of the humerus', insertion: 'styloid process of the radius',
      joints: ['elbow'], actions: ['elbow flexion in a neutral grip'],
      trainedBy: 'hammer and reverse curls, and any neutral-grip pull — it flexes the elbow hardest when the forearm is neither supinated nor pronated',
      whenWeak: 'neutral-grip pulling feels weaker than supinated for no obvious reason, and the forearm looks flat where it should swell below the elbow',
    }],
  },
  abs: {
    label: 'Abs',
    muscles: [{
      name: 'Rectus abdominis',
      origin: 'pubic crest and symphysis', insertion: 'xiphoid process and costal cartilages 5-7',
      joints: ['lumbar spine'], actions: ['spinal flexion', 'posterior pelvic tilt', 'resisting extension'],
      trainedBy: 'crunches and leg raises to flex; squats, presses and carries to RESIST extension — the job it actually does under a bar',
      whenWeak: 'the rib cage flares and the lower back takes the load at the top of a press',
    }, {
      name: 'Transversus abdominis',
      origin: 'thoracolumbar fascia, iliac crest, costal cartilages 7-12', insertion: 'linea alba and pubic crest',
      joints: ['lumbar spine'], actions: ['intra-abdominal pressure — bracing, not movement'],
      trainedBy: 'bracing under load; it is not a muscle you train with a crunch',
      whenWeak: 'the brace leaks at the bottom of a heavy squat',
    }],
  },
  obliques: {
    label: 'Obliques',
    muscles: [{
      name: 'External and internal oblique',
      origin: 'ribs 5-12 (external); thoracolumbar fascia and iliac crest (internal)',
      insertion: 'linea alba, pubis and the lower ribs',
      joints: ['lumbar spine'], actions: ['trunk rotation', 'lateral flexion', 'resisting both'],
      trainedBy: 'anti-rotation work, side planks, suitcase carries; heavy unilateral work trains them without naming them',
      whenWeak: 'the torso rotates under single-arm work and the lower back complains the next day',
    }],
  },
  lats: {
    label: 'Lats',
    muscles: [{
      name: 'Latissimus dorsi',
      origin: 'spinous processes T7-L5 via the thoracolumbar fascia, iliac crest, ribs 9-12, inferior angle of the scapula',
      insertion: 'floor of the bicipital groove of the humerus',
      joints: ['glenohumeral', 'scapulothoracic', 'indirectly the lumbar spine'],
      actions: ['shoulder extension', 'adduction', 'internal rotation'],
      trainedBy: 'vertical pulls train it at length; rows train it shortened. Both, because the fibre directions differ enough that one does not replace the other',
      whenWeak: 'the pull-up becomes a biceps exercise, and the deadlift lets the bar drift forward — the lat is what holds it against the legs',
    }],
  },
  traps: {
    label: 'Traps',
    muscles: [{
      name: 'Trapezius',
      heads: ['upper', 'middle', 'lower'],
      origin: 'external occipital protuberance, nuchal ligament, spinous processes C7-T12',
      insertion: 'lateral clavicle, acromion and the spine of the scapula',
      joints: ['scapulothoracic'],
      actions: ['scapular elevation (upper)', 'retraction (middle)', 'depression and upward rotation (lower)'],
      trainedBy: 'shrugs for the upper, rows for the middle, and overhead work for the lower — the third is the one most lifters never train',
      whenWeak: 'the lower trap is the usual culprit behind a shoulder that pinches overhead: the scapula cannot rotate up out of the way',
    }],
  },
  rhomboids: {
    label: 'Rhomboids',
    muscles: [{
      name: 'Rhomboid major and minor',
      origin: 'spinous processes C7-T5', insertion: 'medial border of the scapula',
      joints: ['scapulothoracic'], actions: ['scapular retraction', 'downward rotation'],
      trainedBy: 'rows where the shoulder blades are allowed to move rather than being locked',
      whenWeak: 'the shoulder blades wing away from the ribcage at the bottom of a row',
    }],
  },
  'lower-back': {
    label: 'Lower back',
    muscles: [{
      name: 'Erector spinae',
      heads: ['iliocostalis', 'longissimus', 'spinalis'],
      origin: 'sacrum, iliac crest and the spinous processes', insertion: 'ribs and vertebrae above',
      joints: ['spine'], actions: ['spinal extension', 'lateral flexion', 'resisting flexion under load'],
      trainedBy: 'deadlifts, hinges, back extensions and every squat that is heavy enough',
      whenWeak: 'the back rounds as the bar leaves the floor — the failure is positional before it is muscular',
    }],
  },
  glutes: {
    label: 'Glutes',
    muscles: [{
      name: 'Gluteus maximus',
      origin: 'posterior ilium, sacrum, coccyx and the sacrotuberous ligament',
      insertion: 'iliotibial tract and the gluteal tuberosity of the femur',
      joints: ['hip'], actions: ['hip extension', 'external rotation', 'abduction (upper fibres)'],
      trainedBy: 'hip thrusts and hinges at short muscle length; squats and lunges at long length. The two are not interchangeable',
      whenWeak: 'the hamstring and the lower back finish the deadlift, and the knees drift in at the bottom of a squat',
    }, {
      name: 'Gluteus medius and minimus',
      origin: 'lateral ilium', insertion: 'greater trochanter of the femur',
      joints: ['hip'], actions: ['hip abduction', 'pelvic stability in single-leg stance'],
      trainedBy: 'single-leg work, abduction work, and simply walking under load',
      whenWeak: 'the pelvis drops on the free side in a split squat — the most common reason a knee tracks inward',
    }],
  },
  quads: {
    label: 'Quads',
    muscles: [{
      name: 'Quadriceps femoris',
      heads: ['rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius'],
      origin: 'anterior inferior iliac spine (rectus femoris only) and the femoral shaft',
      insertion: 'tibial tuberosity via the patellar tendon',
      joints: ['knee', 'hip (rectus femoris only)'],
      actions: ['knee extension', 'hip flexion (rectus femoris)'],
      trainedBy: 'squats, leg presses and extensions. Because the rectus femoris crosses the hip, it is shortened in a seated leg press and lengthened in a lunge — which is why the two feel different',
      whenWeak: 'the squat turns into a good morning: the hips rise first and the bar path shifts forward',
    }],
  },
  hamstrings: {
    label: 'Hamstrings',
    muscles: [{
      name: 'Hamstring group',
      heads: ['biceps femoris (long and short head)', 'semitendinosus', 'semimembranosus'],
      origin: 'ischial tuberosity (and the linea aspera for the short head of biceps femoris)',
      insertion: 'head of the fibula and the medial tibia',
      joints: ['hip', 'knee'],
      actions: ['knee flexion', 'hip extension'],
      trainedBy: 'leg curls for the knee action and RDLs for the hip action. Every head except the short head of biceps femoris crosses both joints, so neither exercise trains the group completely',
      whenWeak: 'the hinge is limited by hamstring stiffness rather than strength more often than lifters assume — test both before programming either',
    }],
  },
  adductors: {
    label: 'Adductors',
    muscles: [{
      name: 'Adductor group',
      heads: ['adductor magnus', 'longus', 'brevis', 'gracilis', 'pectineus'],
      origin: 'inferior pubic ramus and the ischial tuberosity (magnus)',
      insertion: 'linea aspera of the femur and the adductor tubercle',
      joints: ['hip'], actions: ['hip adduction', 'hip extension (the posterior fibres of magnus, which behave like a hamstring)'],
      trainedBy: 'wide-stance squats, deep squats and sumo pulls; adductor magnus is a serious hip extensor and is trained by depth more than by any isolation machine',
      whenWeak: 'the knees collapse inward out of the hole, and deep squatting feels unstable rather than merely hard',
    }],
  },
  calves: {
    label: 'Calves',
    muscles: [{
      name: 'Gastrocnemius',
      heads: ['medial', 'lateral'],
      origin: 'posterior femoral condyles', insertion: 'calcaneus via the Achilles tendon',
      joints: ['knee', 'ankle'], actions: ['plantarflexion', 'assists knee flexion'],
      trainedBy: 'STANDING calf raises — it crosses the knee, so a seated raise shortens it out of the work',
      whenWeak: 'not usually a limiter; it is a cosmetic and tendon-health target more than a performance one for a lifter',
    }, {
      name: 'Soleus',
      origin: 'posterior tibia and fibula', insertion: 'calcaneus via the Achilles tendon',
      joints: ['ankle'], actions: ['plantarflexion, at any knee angle'],
      trainedBy: 'SEATED calf raises, precisely because the knee is bent and the gastrocnemius cannot help',
      whenWeak: 'ankle stiffness limits squat depth more often than the calf being weak does — check dorsiflexion before adding calf work',
    }, {
      name: 'Tibialis anterior',
      origin: 'lateral tibia', insertion: 'medial cuneiform and first metatarsal',
      joints: ['ankle'], actions: ['dorsiflexion'],
      trainedBy: 'direct dorsiflexion work; usually neglected entirely',
      whenWeak: 'the heels lift at the bottom of a squat — often blamed on tight calves when the front of the shin is the half that cannot hold position',
    }],
  },
};

export const ANATOMY_GROUPS = Object.keys(ANATOMY);

// One compact block for a prompt. `focus` narrows it to the muscles a lift or
// a question is actually about — the whole atlas in every turn would crowd out
// his own training history, which matters more.
export function anatomyContext(focus = []) {
  const groups = (focus || []).filter((g) => ANATOMY[g]);
  const list = groups.length ? groups : ANATOMY_GROUPS;
  const lines = ['ANATOMY — the muscles under discussion, in the detail you are expected to know.',
    'These are the same muscles Nova\'s 3D model is built from and can highlight, so anything you name here he can SEE on the figure. Use the real names; explain them in his terms.'];
  for (const g of list) {
    const a = ANATOMY[g];
    lines.push(`\n${a.label} (id: ${g})`);
    for (const m of a.muscles) {
      lines.push(`- ${m.name}${m.heads ? ` [${m.heads.join(', ')}]` : ''}`);
      lines.push(`  origin: ${m.origin}; insertion: ${m.insertion}; crosses: ${m.joints.join(', ')}`);
      lines.push(`  actions: ${m.actions.join('; ')}`);
      lines.push(`  trained by: ${m.trainedBy}`);
      lines.push(`  when it is the weak link: ${m.whenWeak}`);
    }
  }
  if (!groups.length) lines.push('\n(The full atlas — narrow it to what he asked about.)');
  return lines.join('\n');
}

// Which groups a question or an exercise name is about, so the Coach gets the
// relevant anatomy rather than all of it.
const KEYWORDS = {
  chest: /\b(chest|pec|bench|fly|flye|press[- ]?up|push[- ]?up|dip)\b/i,
  'front-delts': /\b(front delt|anterior delt|shoulder press|overhead press|ohp|front raise)\b/i,
  'side-delts': /\b(side delt|lateral (delt|raise)|medial delt|shoulder width)\b/i,
  'rear-delts': /\b(rear delt|posterior delt|face pull|reverse (fly|flye)|rotator|infraspinatus|impinge|pinch\w*)\b/i,
  biceps: /\b(bicep|curl|brachialis|chin[- ]?up)\b/i,
  triceps: /\b(tricep|pushdown|skull ?crusher|lockout|extension)\b/i,
  forearms: /\b(forearm|grip|wrist|brachioradialis)\b/i,
  abs: /\b(abs|abdominal|core|crunch|brace|rectus abdominis)\b/i,
  obliques: /\b(oblique|rotation|side ?bend|anti[- ]rotation)\b/i,
  lats: /\b(lat|latissimus|pulldown|pull[- ]?up|row|back width)\b/i,
  traps: /\b(trap|trapezius|shrug|scapula\w*|overhead|impinge|pinch\w*)\b/i,
  rhomboids: /\b(rhomboid|retract|upper back)\b/i,
  'lower-back': /\b(lower back|erector|spinal|deadlift|hinge|extension)\b/i,
  glutes: /\b(glute|hip thrust|bridge|hip extension|knees? (cave|in)|valgus)\b/i,
  quads: /\b(quad|squat|leg press|leg extension|knee extension|vastus|rectus femoris)\b/i,
  hamstrings: /\b(hamstring|leg curl|rdl|romanian|biceps femoris)\b/i,
  adductors: /\b(adductor|groin|inner thigh|sumo|wide stance|knees? (cave|in)|valgus)\b/i,
  calves: /\b(calf|calves|gastro|soleus|plantarflex|dorsiflex|ankle|tibialis)\b/i,
};

export function focusFor(text = '') {
  const t = String(text || '');
  return ANATOMY_GROUPS.filter((g) => KEYWORDS[g] && KEYWORDS[g].test(t));
}
