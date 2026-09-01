const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

/**
 * 홈 화면 아이콘 밑에 뜨는 이름을 **언어별로** 다르게 한다.
 *
 *   한국어 기기 → 어디뒀지
 *   그 밖       → Stow   (app.json 의 `expo.name`)
 *
 * ⚠ 왜 플러그인이 필요한가:
 *   `expo.name` 은 값이 하나뿐이라 언어를 나눌 수 없다. 안드로이드는 원래
 *   `res/values-ko/strings.xml` 로 이걸 해결하는데, **prebuild 가 android/ 를
 *   통째로 지우고 다시 만들기 때문에** 손으로 넣어 두면 다음 빌드에 사라진다.
 *   그래서 prebuild 의 일부로 매번 다시 써 넣는다.
 *
 * ⚠ 브랜드가 둘이라 앱이 둘인 것은 아니다. 패키지명·스킴·코드는 하나다.
 *   Play Store 도 언어별 제목을 따로 넣을 수 있으니, 스토어 등록 때
 *   한국어 제목만 "어디뒀지" 로 적으면 이 화면과 맞아떨어진다.
 *
 * ⚠ 이름을 또 바꾸게 되면 여기와 `src/lib/strings.*.ts` 의 `auth.appName` 을
 *   같이 고쳐야 한다. 한쪽만 고치면 런처 이름과 앱 안 제목이 어긋난다.
 */
const LOCALIZED = {
  ko: '어디뒀지',
};

module.exports = function withKoreanAppName(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resDir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res');

      for (const [lang, label] of Object.entries(LOCALIZED)) {
        const dir = path.join(resDir, `values-${lang}`);
        fs.mkdirSync(dir, { recursive: true });
        // ⚠ `app_name` 은 Expo 가 만드는 기본 strings.xml 의 키와 같아야 덮인다.
        //   translatable="false" 를 주지 않는다 — 여기가 바로 번역이다.
        fs.writeFileSync(
          path.join(dir, 'strings.xml'),
          `<?xml version="1.0" encoding="utf-8"?>\n` +
            `<resources>\n  <string name="app_name">${label}</string>\n</resources>\n`,
          'utf8',
        );
      }
      return cfg;
    },
  ]);
};
