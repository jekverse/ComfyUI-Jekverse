# ComfyUI-Jekverse 🌐

A powerful, all-in-one sidebar extension for ComfyUI that combines a high-performance **Model Downloader** and a robust **File Manager**.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## ✨ Features

### 📥 Universal Model Downloader
- **Multi-Server Performance**: Powered by `aria2c` for high-speed, parallel connection downloads.
- **Auto-Provider Detection**: intelligently detects whether to use `aria2` or `huggingface_hub` based on your URL.
- **Smart Filename Detection**: Bypasses CivitAI's `HEAD` request restrictions to automatically find the correct filename for your models.
- **Token Support**: 
  - Dedicated inputs for **HuggingFace** and **CivitAI** (for early access/private models).
  - Tokens are stored securely in your browser's local storage (no need to keep re-entering them).
- **Auto-Installation**: Automatically attempts to install `aria2` on your system if it's missing.

### 📁 File Manager
- Browse all your models (`checkpoints`, `loras`, `controlnet`, etc.) directly from the sidebar.
- Perform file operations: **Rename**, **Delete**, **Copy**, and **Move** items without leaving ComfyUI.
- Clean and modern UI integrated seamlessly into the ComfyUI sidebar.

## 🚀 Installation

### 1. Clone the repository
Open a terminal in your `ComfyUI/custom_nodes` folder and run:
```bash
git clone https://github.com/jekverse/ComfyUI-Jekverse.git
```

### 2. Install Dependencies (Optional but Recommended)
The extension will try to handle things automatically, but for the best experience:
```bash
pip install requests huggingface_hub hf_transfer
# For Linux users (Aria2 is required)
sudo apt-get install aria2
```

### 3. Restart ComfyUI
Restart your ComfyUI server and you will see the **Globe Icon** (🌐) in your sidebar!

## 🛠️ Configuration
- **HuggingFace Token**: Required for gated or private models.
- **CivitAI Token**: Required for Early Access models or member-only downloads.
- Tokens are saved locally in your browser.

## 📄 License
This project is licensed under the MIT License.

---
*Developed with ❤️ for the ComfyUI Community by Jekverse.*
