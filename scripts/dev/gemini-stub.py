"""
Gemini generateContent 스텁 — 로컬에서 Edge Function 전체 경로를 실제 키 없이 돌려 보기 위한 것.

프롬프트에서 "i1: 두부 × 2 모" 줄들을 읽어, 그 이름을 실제로 쓰는 레시피 3개를 만들어 돌려준다.
검증기(validateResult)가 요구하는 것 — owned_refs 는 목록의 ref, 단계 글에 그 이름이 나온다 —
을 지키므로 정상 경로가 통과한다. `?mode=bad` 로 부르면 일부러 규격을 어긴 답을 준다.
"""
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8091
LINE = re.compile(r"^(i\d+): (.+?) × (\d+)", re.M)


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(n) or b"{}")
        prompt = body["contents"][0]["parts"][0]["text"]
        items = LINE.findall(prompt)
        hint = ""
        m = re.search(r'힌트: "([^"]*)"|hint: "([^"]*)"', prompt)
        if m:
            hint = m.group(1) or m.group(2) or ""
        avoid = "피한다" in prompt or "Avoid" in prompt

        recipes = []
        for i in range(3):
            ref, name, _q = items[i % len(items)]
            tag = " (재추천)" if avoid else ""
            recipes.append(
                {
                    "title": f"{name} 요리 {i + 1}{tag}" + (f" · {hint}" if hint else ""),
                    "summary": f"{name}로 만드는 간단한 한 끼",
                    "minutes": 15 + 5 * i,
                    "difficulty": "easy" if i < 2 else "medium",
                    "servings": 2,
                    "owned_refs": [ref],
                    "staples": ["소금", "식용유"],
                    "missing": ["대파"] if i == 1 else [],
                    "steps": [f"{name}를 손질한다.", "팬에 기름을 두른다.", f"{name}를 넣고 5분 볶는다."],
                }
            )
        if "mode=bad" in self.path:
            recipes = recipes[:1]  # 개수 위반 → INVALID_RESULT 경로
        text = json.dumps({"recipes": recipes}, ensure_ascii=False)
        out = json.dumps(
            {
                "candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}],
                "usageMetadata": {"promptTokenCount": 300, "candidatesTokenCount": 400},
            }
        ).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, fmt, *args):  # 조용히
        sys.stderr.write("[stub] " + (fmt % args) + "\n")


print(f"gemini stub on :{PORT}", flush=True)
HTTPServer(("0.0.0.0", PORT), H).serve_forever()
