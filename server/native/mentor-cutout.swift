// THE CUT-OUT PORTRAIT (Mentors, slice 1). A person cut out of his channel
// portrait with Apple's subject lift, so his face sits on any colour with no
// disc of the old background behind it.
//
//   nova-mentor-cutout <in.jpg> <out.png> [size]
//
// One JSON line on stdout: {"ok":true,"instances":N,"size":S} or
// {"error":"..."} with a non-zero exit. Built from this file on this Mac by
// server/lib/mentorArt.js (swiftc), never committed (server/bin is ignored).
//
// The clean-up is the one the mockup used (tools/cutclean.py), done here so
// the server needs no Python: the alpha edge shrinks by a pixel and is
// feathered, and the band of about four pixels along the edge loses most of
// its colour, so no tint of the old background survives on a new field.
import Foundation
import Vision
import CoreImage
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func fail(_ msg: String) -> Never {
  print("{\"error\":\(String(reflecting: msg))}")
  exit(1)
}

let args = CommandLine.arguments
if args.count < 3 { fail("usage: nova-mentor-cutout <in> <out.png> [size]") }
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])
let size = args.count > 3 ? max(64, min(1024, Int(args[3]) ?? 480)) : 480

guard let src = CGImageSourceCreateWithURL(inURL as CFURL, nil),
      let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fail("the portrait could not be read as an image") }

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
let req = VNGenerateForegroundInstanceMaskRequest()
do { try handler.perform([req]) } catch { fail("Apple's subject lift failed: \(error.localizedDescription)") }
guard let obs = req.results?.first, !obs.allInstances.isEmpty else { fail("Apple's subject lift found no person in the portrait") }

let maskBuf: CVPixelBuffer
do { maskBuf = try obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler) } catch { fail("the subject mask could not be made: \(error.localizedDescription)") }

// the source, as RGBA8 at its own size
let W = cg.width, H = cg.height
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
var rgba = [UInt8](repeating: 0, count: W * H * 4)
guard let ctx = CGContext(data: &rgba, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("no drawing context") }
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))

// the mask, as floats 0..1 (one channel, the image's own size)
CVPixelBufferLockBaseAddress(maskBuf, .readOnly)
let mw = CVPixelBufferGetWidth(maskBuf), mh = CVPixelBufferGetHeight(maskBuf)
let mrow = CVPixelBufferGetBytesPerRow(maskBuf)
guard let mbase = CVPixelBufferGetBaseAddress(maskBuf) else { fail("the subject mask is empty") }
var alpha = [Float](repeating: 0, count: W * H)
for y in 0..<H {
  let my = min(mh - 1, y * mh / H)
  let row = mbase.advanced(by: my * mrow).assumingMemoryBound(to: Float32.self)
  for x in 0..<W { alpha[y * W + x] = max(0, min(1, row[min(mw - 1, x * mw / W)])) }
}
CVPixelBufferUnlockBaseAddress(maskBuf, .readOnly)

// a square minimum filter (erosion) of radius r
func erode(_ a: [Float], _ r: Int) -> [Float] {
  var tmp = a, out = a
  for y in 0..<H { for x in 0..<W {
    var m: Float = 1
    for dx in -r...r { let xx = x + dx; m = min(m, (xx < 0 || xx >= W) ? 0 : a[y * W + xx]) }
    tmp[y * W + x] = m
  } }
  for y in 0..<H { for x in 0..<W {
    var m: Float = 1
    for dy in -r...r { let yy = y + dy; m = min(m, (yy < 0 || yy >= H) ? 0 : tmp[yy * W + x]) }
    out[y * W + x] = m
  } }
  return out
}
// a small gaussian (sigma about 0.7 px), separable
func feather(_ a: [Float]) -> [Float] {
  let k: [Float] = [0.0657, 0.2464, 0.3758, 0.2464, 0.0657]
  var tmp = a, out = a
  for y in 0..<H { for x in 0..<W {
    var s: Float = 0
    for i in -2...2 { let xx = max(0, min(W - 1, x + i)); s += a[y * W + xx] * k[i + 2] }
    tmp[y * W + x] = s
  } }
  for y in 0..<H { for x in 0..<W {
    var s: Float = 0
    for i in -2...2 { let yy = max(0, min(H - 1, y + i)); s += tmp[yy * W + x] * k[i + 2] }
    out[y * W + x] = s
  } }
  return out
}

let shrunk = feather(erode(alpha, 1))
let deep = erode(shrunk, 4)   // anything within about four pixels of transparency is the edge band

// un-premultiply, take the colour out of the band, write straight alpha
var outPx = [UInt8](repeating: 0, count: W * H * 4)
for i in 0..<(W * H) {
  let a0 = Float(rgba[i * 4 + 3]) / 255
  var r = a0 > 0 ? Float(rgba[i * 4]) / 255 / a0 : 0
  var g = a0 > 0 ? Float(rgba[i * 4 + 1]) / 255 / a0 : 0
  var b = a0 > 0 ? Float(rgba[i * 4 + 2]) / 255 / a0 : 0
  let a = shrunk[i]
  let inside: Float = a > 0.01 ? 1 : 0
  let band = (1 - deep[i]) * inside * 0.6
  if band > 0 {
    let l = 0.299 * r + 0.587 * g + 0.114 * b
    r += (l - r) * band; g += (l - g) * band; b += (l - b) * band
  }
  // premultiplied again for the CGImage below
  outPx[i * 4] = UInt8(max(0, min(255, (r * a * 255).rounded())))
  outPx[i * 4 + 1] = UInt8(max(0, min(255, (g * a * 255).rounded())))
  outPx[i * 4 + 2] = UInt8(max(0, min(255, (b * a * 255).rounded())))
  outPx[i * 4 + 3] = UInt8(max(0, min(255, (a * 255).rounded())))
}

guard let full = CGContext(data: &outPx, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)?.makeImage() else { fail("the cut-out could not be drawn") }

// down to the size asked for, keeping the aspect
let scale = Double(size) / Double(max(W, H))
let ow = max(1, Int((Double(W) * scale).rounded())), oh = max(1, Int((Double(H) * scale).rounded()))
guard let small = CGContext(data: nil, width: ow, height: oh, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("no drawing context for the small size") }
small.interpolationQuality = .high
small.draw(full, in: CGRect(x: 0, y: 0, width: ow, height: oh))
guard let img = small.makeImage() else { fail("the small cut-out could not be drawn") }

let tmpURL = outURL.deletingLastPathComponent().appendingPathComponent(".\(outURL.lastPathComponent).\(getpid()).tmp")
guard let dest = CGImageDestinationCreateWithURL(tmpURL as CFURL, UTType.png.identifier as CFString, 1, nil) else { fail("the cut-out file could not be opened for writing") }
CGImageDestinationAddImage(dest, img, nil)
if !CGImageDestinationFinalize(dest) { fail("the cut-out file could not be written") }
do {
  if FileManager.default.fileExists(atPath: outURL.path) { try FileManager.default.removeItem(at: outURL) }
  try FileManager.default.moveItem(at: tmpURL, to: outURL)
} catch { fail("the cut-out file could not be put in place: \(error.localizedDescription)") }
print("{\"ok\":true,\"instances\":\(obs.allInstances.count),\"size\":\(size)}")
