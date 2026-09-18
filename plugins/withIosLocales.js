const { IOSConfig, withXcodeProject } = require('@expo/config-plugins');

/**
 * 언어별 Info.plist 문구(`ios/Stow/Supporting/<lang>.lproj/InfoPlist.strings`)를 만든다.
 *
 * 무엇을 가르나: 권한 문구(카메라·사진)와 한국어 런처 이름(`CFBundleDisplayName`).
 * 기본 Info.plist 는 **영어**이고, 한국어 기기만 `ko.lproj` 를 본다.
 *
 * ⚠⚠ **`app.json` 의 최상위 `locales` 를 쓰면 안 된다.** 그건 iOS 전용이 아니다 —
 *   prebuild 가 Android 에도 `res/values-b+ko/strings.xml` 을 만들고 **iOS 키를 그대로**
 *   집어넣는다(CFBundleDisplayName, NSCameraUsageDescription…). Android 에서는 뜻이 없는
 *   키인데 기본 로케일에 없어서 릴리스 lint 가 막는다:
 *     "CFBundleDisplayName is translated here but not found in default locale [ExtraTranslation]"
 *   → `lintVitalRelease` 실패, AAB 가 아예 안 나온다 (2026-09-18 실제로 겪음).
 *
 * ⚠ 그래서 locales 를 이 플러그인의 **인자로만** 받고, **mod 가 도는 순간에** 끼워 넣는다.
 *   config 에 미리 얹어 두면 두 가지로 실패한다:
 *     · 그대로 두면 → Android mod 가 보고 위의 strings.xml 을 만든다
 *     · 얹었다가 곧바로 떼면 → mod 는 **나중에** 실행되는데 그때는 이미 없어서 아무것도 안 만든다
 *       (실제로 이렇게 짰다가 .lproj 가 하나도 안 생겼다)
 *
 * ⚠ Android 의 한국어 런처 이름은 이 플러그인과 **무관하다** — `withKoreanAppName` 이
 *   `values-ko/app_name` 으로 따로 한다. 두 플랫폼이 같은 이름을 쓰는데 경로가 다르다.
 *
 * 사용 (app.json):
 *   ["./plugins/withIosLocales", { "en": "./locales/en.json", "ko": "./locales/ko.json" }]
 */
module.exports = function withIosLocales(config, locales) {
  if (!locales || Object.keys(locales).length === 0) return config;
  return withXcodeProject(config, async (cfg) => {
    cfg.modResults = await IOSConfig.Locales.setLocalesAsync(
      // ⚠ 여기서만 locales 를 보여 준다 — 머리말 참고
      { ...cfg, locales },
      { projectRoot: cfg.modRequest.projectRoot, project: cfg.modResults },
    );
    return cfg;
  });
};
