# Scanly — Fast QR Code Scanner & Decoder

A professional-grade QR code scanning and decoding tool with industrial-strength image processing, built with Next.js.

![Next.js](https://img.shields.io/badge/Next.js-14.2.5-black)
![React](https://img.shields.io/badge/React-18.3.1-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5.3-blue)

## ✨ Features

- 📷 **Real-time Camera Scanning** - Scan QR codes using your device camera in real-time
- 🖼️ **Smart Image Upload** - AI-powered region detection processes only QR code areas, not entire images
- 🎯 **Edge Density Detection** - Automatically locates QR codes using edge concentration analysis
- ⚡ **Region-Focused Processing** - Reduces unnecessary full-image processing by cropping to likely QR regions
- 📱 **Multi-Camera Support** - Automatically detect and switch between front/back cameras
- 🔗 **Smart Link Recognition** - Automatically identify URLs and provide quick access
- 📋 **One-Click Copy** - Easily copy decoded results to clipboard
- 💫 **Haptic Feedback** - Vibration feedback on successful scan (supported devices)
- 🎨 **Modern UI** - Clean and beautiful user interface with real-time processing status
- 🚀 **Targeted Upload Decoding** - Applies contrast and threshold fallbacks to likely QR regions before broader scans
- 🔄 **Multi-Layer Fallback** - Combines jsQR and ZXing with intelligent fallback strategies

## 🎯 Advanced Decoding Capabilities

This tool can successfully decode challenging QR codes that many other tools struggle with:

- ✅ **Low-contrast QR codes** (gray on gray backgrounds)
- ✅ **Screen-captured photos** with moiré patterns
- ✅ **Blurry or out-of-focus images**
- ✅ **Poorly lit photos** (too dark or too bright)
- ✅ **Complex backgrounds**
- ✅ **Small QR codes** in large images
- ✅ **Damaged or partial QR codes**

### 🚀 Smart Region Detection Technology

Inspired by region-focused scanning strategies used in modern mobile QR scanners, this tool avoids wastefully processing entire images:

1. **QR Location Preview** (400px preview)
   - Divides image into 20×20 grid
   - Analyzes edge density in each 5×5 cell area
   - Identifies high-density regions (QR codes have many edges)

2. **Precision Cropping**
   - Extracts only the detected QR region
   - Example: 4000×3000 photo → 500×500 QR area
   - Reduces unnecessary full-image processing by focusing on a smaller candidate area

3. **Targeted Processing**
   - Auto contrast stretching
   - Simple threshold tests (115, 140, 165)
   - Fallback to full image if detection fails

**Benchmark:**
- Current fixture benchmark: 16 upload-mode images
- Success rate: 12/16 = 75.0%
- Average elapsed time: 0.08s
- Median elapsed time: 0.06s
- See [docs/benchmark.md](docs/benchmark.md) for per-image results and failure analysis.

## 🛠️ Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **UI Library**: [React 18](https://react.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Primary Decoder**: [jsQR](https://github.com/cozmo/jsQR) - Optimized for static image decoding
- **Backup Decoder**: [@zxing/browser](https://github.com/zxing-js/browser) - Real-time camera scanning
- **Image Processing**: Edge-density region detection, contrast stretching, thresholding, and targeted decoding

## 📦 Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Yangjunjie-Lin/Scanly.git
cd Scanly
npm install
```

## 🚀 Usage

### Development Mode

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the app.

### Production Build

Build for production:

```bash
npm run build
npm start
```

## 💡 How to Use

### Camera Mode

1. Click the **"Camera"** tab to switch to camera mode
2. Allow browser camera permissions when prompted
3. Select your preferred camera from the dropdown if multiple are available
4. Click **"Start Scan"** to begin scanning
5. Point the QR code within the camera frame
6. The result will be displayed automatically upon successful scan

### Upload Mode (Recommended for Difficult QR Codes)

1. Click the **"Upload"** tab to switch to upload mode
2. Click **"Choose File"** to select an image containing a QR code
3. Watch as the system automatically:
   - Detects QR location using edge density analysis
   - Crops to the relevant region
   - Applies optimized decoding methods
4. Real-time status shows current processing stage
5. The result will be displayed once decoding succeeds

**Pro Tips for Best Results:**
- ✅ For low-contrast QR codes, use upload mode instead of camera
- ✅ No need to crop manually - smart detection handles it automatically
- ✅ Ensure the QR code is visible and not severely damaged
- ✅ Larger images are OK - the tool automatically finds and focuses on QR area
- ✅ Screen photos work well thanks to region detection technology

### Result Actions

- If the decoded result is a URL, an **"Open Link"** button will appear for quick access
- Click the **"Copy"** button to copy the result to your clipboard

## 📁 Project Structure

```
Scanly/
├── app/
│   ├── globals.css      # Global styles
│   ├── layout.tsx       # Root layout component
│   └── page.tsx         # Home page
├── components/
│   └── QRTool.tsx       # Main QR scanning tool component
├── next.config.js       # Next.js configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Project dependencies
```

## 🔬 Technical Details

### Intelligent Processing Pipeline

When you upload an image, the decoder uses a smart two-phase approach:

#### Phase 1: QR Location Detection

1. **Downscale to 400px** preview for speed
2. **Grid Analysis**: Divide into 20×20 cells
3. **Edge Density Calculation**:
   - Sample each cell center
   - Compute horizontal/vertical edge strength
   - Find 5×5 area with maximum density
4. **QR Region Extraction**: Crop detected area with padding

#### Phase 2: Targeted Decoding

1. **Crop to Region** (800px max, preserves quality)
   - Process only detected QR area
   - Reduces unnecessary full-image processing
   - Example: 4000×3000 → 500×500

2. **Fast Decoding Attempts**:
   - ✅ Original cropped area
   - ✅ Auto contrast stretch (min-max normalization)
   - ✅ Simple threshold tests (115, 140, 165)
   - ✅ Fallback: Full image scan if region detection fails
   - ✅ Last resort: ZXing decoder backup

3. **Optimization Strategies**:
   - Early return on first success
   - Aggressive downscaling (800px sweet spot)
   - Fast algorithms only (no slow Otsu/adaptive)
   - Parallel processing where beneficial

**Why It's Fast:**
- Full-image decoding can require processing every pixel in a large image
- Scanly first estimates a likely QR region, then applies decoding attempts to that smaller crop
- See [docs/benchmark.md](docs/benchmark.md) for the current measured baseline

## 🔧 Configuration

### Camera Permission

The app requires access to your device camera. On first use, the browser will request permission. Make sure:

- You're using HTTPS or localhost
- Your browser supports the MediaDevices API
- Camera access permission is granted

### Browser Compatibility

Compatible with all modern browsers:

- ✅ Chrome / Edge (Recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Opera

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 📄 License

MIT License

## 👤 Author

Yangjunjie Lin

- GitHub: [@Yangjunjie-Lin](https://github.com/Yangjunjie-Lin)

## 🙏 Acknowledgments

- [jsQR](https://github.com/cozmo/jsQR) - Excellent pure JavaScript QR code library
- [ZXing](https://github.com/zxing-js/browser) - Comprehensive barcode scanning library
- [Next.js](https://nextjs.org/) - Powerful React framework
- [Vercel](https://vercel.com/) - Deployment platform

## 🌟 Why This Tool?

Unlike many basic QR code readers, this tool uses region-focused detection inspired by modern mobile QR scanners. Instead of blindly processing entire images, it intelligently locates and focuses on QR code areas.

**Key Advantages:**
- 🎯 **Smart Detection**: Finds QR codes automatically using edge density analysis
- ⚡ **Targeted Processing**: Processes likely QR regions before falling back to broader scans
- 🎨 **Region-Focused Design**: Designed to reduce unnecessary full-image processing by cropping to likely QR regions
- 🔬 **Scientific Approach**: Grid-based edge detection, not brute force
- 💪 **Robust**: Handles low-contrast, blurry, and screen-captured images

**Perfect for:**
- 📸 Photos of screens with low contrast
- 🖼️ Old or degraded QR codes
- 📱 Screenshots and screen captures
- 🎯 QR codes in challenging lighting conditions
- 🔍 Small QR codes in large images (e.g., 500×500 code in 4000×3000 photo)

---

⭐ If this project helps you, please give it a star!
