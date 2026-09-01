const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * 릴리스 빌드를 **업로드 키**로 서명한다.
 *
 * ⚠ 왜 플러그인인가: `prebuild` 는 `android/` 를 통째로 지우고 다시 만든다.
 *   `app/build.gradle` 을 손으로 고쳐 두면 다음 빌드에 사라지고, 그러면 조용히
 *   **디버그 키로 서명된 APK** 가 나온다. Play Store 는 그걸 받지 않는다.
 *
 * ⚠ 비밀번호를 여기 적지 않는다. gradle 이 환경변수에서 읽는다.
 *   값은 `.env.production.local`(gitignore, chmod 600)에 있고,
 *   `scripts/build-android.sh` 가 빌드 직전에 export 한다.
 *
 * ⚠ 환경변수가 없으면 **서명 설정을 넣지 않는다.** 빈 값으로 서명하면
 *   "성공했는데 설치가 안 되는" 상태가 되는데, 원인을 찾기가 아주 어렵다.
 *   차라리 디버그 서명으로 남겨 두고 빌드 스크립트가 경고하게 한다.
 *
 * 참고: Play 앱 서명을 쓰므로 이 키는 **업로드 키**다. 잃어버려도 구글에
 *   재설정을 요청할 수 있다(앱 서명 키는 구글이 보관한다).
 */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;

    let src = cfg.modResults.contents;
    if (src.includes('STOW_UPLOAD_STORE_FILE')) return cfg; // 이미 넣었다

    // 1) signingConfigs 에 release 를 추가한다
    const anchor = 'signingConfigs {';
    if (!src.includes(anchor)) throw new Error('signingConfigs 블록을 찾지 못했습니다');
    src = src.replace(
      anchor,
      `${anchor}
        // ⚠ plugins/withReleaseSigning.js 가 넣은 블록이다. 손으로 고치지 말 것 —
        //   prebuild 때마다 다시 생성된다.
        release {
            if (System.getenv("STOW_UPLOAD_STORE_FILE")) {
                storeFile file(System.getenv("STOW_UPLOAD_STORE_FILE"))
                storePassword System.getenv("STOW_UPLOAD_STORE_PASSWORD")
                keyAlias System.getenv("STOW_UPLOAD_KEY_ALIAS")
                keyPassword System.getenv("STOW_UPLOAD_KEY_PASSWORD")
            }
        }`,
    );

    // 2) release 빌드타입이 그 설정을 쓰게 한다
    //    ⚠ 환경변수가 없을 때만 디버그 키로 떨어진다 (빌드 스크립트가 경고한다)
    src = src.replace(
      /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/s,
      '$1signingConfig System.getenv("STOW_UPLOAD_STORE_FILE") ? signingConfigs.release : signingConfigs.debug',
    );

    cfg.modResults.contents = src;
    return cfg;
  });
};
