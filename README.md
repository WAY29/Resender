<a id="readme-top"></a>

<br />
<div align="center">
  <a href="https://github.com/WAY29/Resender">
    <img src="public/icon.png" alt="Resender logo" width="96" height="96">
  </a>

  <h3 align="center">Resender</h3>

  <p align="center">
    A Chrome DevTools extension for editing and resending captured Fetch/XHR requests.
    <br />
    <a href="https://github.com/WAY29/Resender/issues">Report Bug</a>
    ·
    <a href="https://github.com/WAY29/Resender/issues">Request Feature</a>
  </p>
</div>

## Table Of Contents

1. [About The Project](#about-the-project)
2. [Built With](#built-with)
3. [Getting Started](#getting-started)
4. [Usage](#usage)
5. [Roadmap](#roadmap)
6. [Contributing](#contributing)
7. [License](#license)
8. [Contact](#contact)
9. [Acknowledgments](#acknowledgments)

## About The Project

Resender adds a dedicated DevTools panel that mirrors the parts of Chrome's Network tab needed to inspect, edit, and replay requests. It exists because Chrome extensions cannot add an "Edit and resend" item directly to the built-in Network tab context menu.

Current features:

- Capture Fetch/XHR requests from the inspected tab without clearing records on navigation.
- Inspect request metadata, headers, payload, response headers, and response bodies.
- Edit replayable request headers and payloads, then resend the request from the inspected page.
- Link redirect chains so 3xx requests can jump to the final request.
- Sort and resize request-list columns, resize the list/detail split, and close the detail pane.
- Import and export Resender request captures.
- Follow Chrome language preferences with English and Simplified Chinese UI text.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Built With

- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [Vitest](https://vitest.dev/)
- [Chrome Extensions Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- Chrome 114 or newer

### Installation From Releases

1. Open the [Releases](https://github.com/WAY29/Resender/releases) page.
2. Download the latest `resender-*.zip` asset.
3. Unzip the file to a local folder.
4. Open `chrome://extensions`.
5. Enable `Developer mode`.
6. Click `Load unpacked` and select the unzipped folder.

### Development

```sh
git clone https://github.com/WAY29/Resender.git
cd Resender
npm ci
npm run test
npm run typecheck
npm run build
```

The production extension is generated in `dist/`. The `dist/` directory is intentionally ignored by Git and published through GitHub Releases instead.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

1. Load the extension in Chrome.
2. Open DevTools for a target page.
3. Select the `Resender` DevTools panel.
4. Keep capture enabled while the page makes Fetch/XHR requests.
5. Select a request to inspect headers, payload, and response data.
6. Edit request headers or payload, then click `Send` to replay it.
7. Use import/export to move captured request sets between sessions.

Some browser-controlled headers cannot be replayed because Chrome and Fetch own them. Binary, streaming, oversized, and unsupported request bodies are displayed for context but are not editable yet.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap

- Improve parity with Chrome DevTools Network rendering.
- Add broader body editors for form and multipart payloads.
- Preserve more initiator/source metadata when Chrome exposes it.
- Package signed store builds after release automation is stable.

See the [open issues](https://github.com/WAY29/Resender/issues) for proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

1. Fork the project.
2. Create your feature branch: `git checkout -b feat/my-change`.
3. Commit your changes with a Conventional Commit message.
4. Run `npm run test`, `npm run typecheck`, and `npm run build`.
5. Push to your branch and open a pull request.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

Distributed under the GNU General Public License v3.0. See [LICENSE](LICENSE) for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

Project Link: [https://github.com/WAY29/Resender](https://github.com/WAY29/Resender)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Acknowledgments

- [Best README Template](https://github.com/othneildrew/Best-README-Template)
- Chrome DevTools Network panel
- Chrome Extensions documentation

<p align="right">(<a href="#readme-top">back to top</a>)</p>
