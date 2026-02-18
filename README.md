# NovelForge Web Viewer

NovelForge DB를 브라우저에서 조회하는 웹 뷰어입니다. 백엔드 없이 Dropbox 링크 또는 로컬 DB 파일로 동작합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 접속 후, DB 파일을 선택하거나 Dropbox 공유 링크를 입력하세요.

## 빌드 및 배포

```bash
npm run build
```

`dist/` 폴더를 정적 호스팅(GitHub Pages, Netlify 등)에 배포하면 됩니다.

## GitHub Pages

이 저장소는 공개되어 있어 Settings → Pages에서 소스를 **GitHub Actions**로 설정한 뒤, 배포 워크플로를 사용하면 `https://fansenryu-cmd.github.io/WebViewer/` 로 접속할 수 있습니다.
