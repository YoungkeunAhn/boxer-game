import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "boxer-idle",
  brand: {
    displayName: "복서키우기",
    primaryColor: "#f6bb43",
    // TODO: 앱인토스 콘솔에 앱 아이콘을 등록한 뒤 발급된 이미지 URL로 교체한다.
    icon: "",
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite --host",
      build: "tsc -b && vite build",
    },
  },
  permissions: [],
  outdir: "dist",
  webViewProps: {
    type: "game",
    overScrollMode: "never",
  },
});
