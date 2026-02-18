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

## GitHub Pages (접속이 안 될 때)

**반드시 한 번만 설정하면 됩니다.**

1. **https://github.com/fansenryu-cmd/WebViewer** 접속 → **Settings** 탭
2. 왼쪽 사이드바 **Code and automation** → **Pages** 클릭
3. **Build and deployment**에서 **Source**를 **"Deploy from a branch"**가 아니라 **"GitHub Actions"**로 선택
4. 저장 후 **Actions** 탭에서 **Deploy to GitHub Pages** 워크플로를 **Run workflow**로 한 번 실행

설정 후 몇 분 지나면 **https://fansenryu-cmd.github.io/WebViewer/** 로 접속할 수 있습니다.
