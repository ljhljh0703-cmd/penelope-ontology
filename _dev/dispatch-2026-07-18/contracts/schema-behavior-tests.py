# schema-behavior-tests.py — Penelope narrative harness v2 검증 스크립트 (게이트 정정 receipt 동반)
# 실행 의존성: Python >= 3.11 · jsonschema == 4.26.0 · referencing
# 실행: python3 schema-behavior-tests.py  (같은 폴더에서)
# 주의: 시스템 기본 `python3`가 위 의존성(jsonschema/referencing)을 갖지 않을 수 있다.
#       의존성이 설치된 로컬 실행기를 사용한다 (예: miniforge python3 —
#       /opt/homebrew/Caskroom/miniforge/base/bin/python3). 사용자 홈 절대경로는 기록하지 않는다.
# 출력 전문이 VERIFICATION-RECEIPT-2026-07-18-c22.txt 로 저장된 것이 receipt 정본이다.
# 범위 주의: 이 테스트는 JSON parse / metaschema / 스키마 동작(수용·거부)만 증명한다.
# ID 실존·subset·disjoint, 의미상 상태 변화, hardPass 함의, plan-문단 정합,
# contentBoundary 위반 탐지는 Codex 의 deterministic preflight/post-validator 구현 범위다.

import json, re, os, sys, datetime
from importlib.metadata import version as pkgver
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

results = []
def check(name, ok, expect=True):
    status = "PASS" if ok == expect else "FAIL"
    results.append((status, name))
    print(f"[{status}] {name} (expected={'valid' if expect else 'reject'}, got={'valid' if ok else 'reject'})")

print("# VERIFICATION RECEIPT — penelope-narrative-harness-v2")
print("date:", datetime.date(2026, 7, 18).isoformat(), "| python:", sys.version.split()[0], "| jsonschema:", pkgver("jsonschema"))
print()

# ---------- 1. JSON parse (8 files) ----------
json_files = [
    "PENELOPE-NARRATIVE-INPUT.schema.json",
    "PENELOPE-SENTENCE-HARNESS.schema.json",
    "PENELOPE-ENGLISH-STYLE-PROFILE.schema.json",
    "PENELOPE-ENGLISH-STYLE-PROFILE.json",
    "PENELOPE-NARRATIVE-OUTPUT.schema.json",
    "PENELOPE-NARRATIVE-PIPELINE-ENVELOPE.schema.json",
    "PENELOPE-NARRATIVE-PREFLIGHT.schema.json",
    "PENELOPE-NARRATIVE-AUTHORITY-CONTRACT.json",
]
docs = {}
for f in json_files:
    docs[f] = json.load(open(f, encoding="utf-8"))
print(f"[PASS] JSON parse {len(json_files)}/{len(json_files)}:", ", ".join(json_files))
print()

# ---------- 2. metaschema (6 schemas) ----------
schema_files = [f for f in json_files if f.endswith(".schema.json")]
for f in schema_files:
    Draft202012Validator.check_schema(docs[f])
print(f"[PASS] Draft 2020-12 metaschema {len(schema_files)}/{len(schema_files)}:", ", ".join(schema_files))
print()

# ---------- 3. registry (envelope -> output external $ref) ----------
registry = Registry().with_resources([
    (docs["PENELOPE-NARRATIVE-OUTPUT.schema.json"]["$id"], Resource.from_contents(docs["PENELOPE-NARRATIVE-OUTPUT.schema.json"])),
    (docs["PENELOPE-NARRATIVE-PIPELINE-ENVELOPE.schema.json"]["$id"], Resource.from_contents(docs["PENELOPE-NARRATIVE-PIPELINE-ENVELOPE.schema.json"])),
])
V_out = Draft202012Validator(docs["PENELOPE-NARRATIVE-OUTPUT.schema.json"], registry=registry)
V_env = Draft202012Validator(docs["PENELOPE-NARRATIVE-PIPELINE-ENVELOPE.schema.json"], registry=registry)
V_inp = Draft202012Validator(docs["PENELOPE-NARRATIVE-INPUT.schema.json"])
V_sh  = Draft202012Validator(docs["PENELOPE-SENTENCE-HARNESS.schema.json"])
V_pf  = Draft202012Validator(docs["PENELOPE-NARRATIVE-PREFLIGHT.schema.json"])
V_sp  = Draft202012Validator(docs["PENELOPE-ENGLISH-STYLE-PROFILE.schema.json"])

# ---------- 4. instance validation ----------
errs = list(V_sp.iter_errors(docs["PENELOPE-ENGLISH-STYLE-PROFILE.json"]))
check("T01 style-profile instance validates against its schema", not errs)
print()

# ---------- 5. preflight behavior ----------
def receipt(mode, actions, changes, extra=None, dlg=None):
    r = {"preflightId": "pf-test-1", "sceneMode": mode,
         "sceneAuthority": {"factIds": ["fact.a"], "eventIds": ["event.a"], "actorEntityIds": ["entity.a"],
                            "licensedRenderingDetailIds": [], "licensedRenderingDetails": []},
         "referenceReceipt": {"status": "available", "referenceId": "creator-craft-reference-2026-07-17-01",
                              "transferableTechniqueIds": ["TT-01"],
                              "sceneApplicability": [{"techniqueId": "TT-01", "plainReason": "test"}],
                              "forbiddenImitation": True, "excludedGimmicks": ["FC-04"]},
         "plainDramaticPlan": {"focalActorId": "entity.a", "actionSourceEventIds": actions,
                               "reactionSourceEventIds": actions, "changeSourceEventIds": changes},
         "dialogueAuthority": dlg or {"mode": "none", "speakerId": None, "speechAct": None,
                                      "speechEventIds": [], "speechActLicenseIds": [],
                                      "authorizedContentIds": [], "plainIntent": None,
                                      "plainIntentSourceAuthorityIds": []},
         "creatorReviewRequired": True}
    if extra: r["plainDramaticPlan"].update(extra)
    return r

check("T02 preflight: setup carrying a change beat is rejected (fake-change guard)",
      V_pf.is_valid(receipt("setup", [], ["event.a"])), expect=False)
check("T03 preflight: valid turn (action+reaction+change+plain change) accepted",
      V_pf.is_valid(receipt("turn", ["event.a"], ["event.a"],
                            {"changeInPlainTerms": {"text": "t", "sourceAuthorityIds": ["event.a"]}})))
check("T04 preflight: valid setup (no beats, no change field) accepted",
      V_pf.is_valid(receipt("setup", [], [])))
lic_dlg_no_intent = receipt("setup", [], [], dlg={"mode": "licensed", "speakerId": "entity.a", "speechAct": "question",
    "speechEventIds": ["event.speech.a"], "speechActLicenseIds": [], "authorizedContentIds": ["fact.a"],
    "plainIntent": None, "plainIntentSourceAuthorityIds": []})
check("T05 preflight: licensed dialogue without plain intent rejected", V_pf.is_valid(lic_dlg_no_intent), expect=False)
dlg_general_event_only = receipt("setup", [], [], dlg={"mode": "licensed", "speakerId": "entity.a", "speechAct": "question",
    "speechEventIds": [], "speechActLicenseIds": [], "authorizedContentIds": ["fact.a"],
    "plainIntent": "ask", "plainIntentSourceAuthorityIds": ["fact.a"]})
check("T06 preflight (AC-DLG-01): licensed dialogue with NO speech event/license rejected — general events cannot authorize speech",
      V_pf.is_valid(dlg_general_event_only), expect=False)
dlg_speech_license = receipt("setup", [], [], dlg={"mode": "licensed", "speakerId": "entity.a", "speechAct": "question",
    "speechEventIds": [], "speechActLicenseIds": ["lic.speech.a"], "authorizedContentIds": ["fact.a"],
    "plainIntent": "ask", "plainIntentSourceAuthorityIds": ["fact.a"]})
check("T07 preflight (AC-DLG-01): licensed dialogue bound to speech_act license accepted", V_pf.is_valid(dlg_speech_license))
print()

# ---------- 6. sentence-harness behavior ----------
def plan(role, changes, facts=None, events=None, speech=None, lic=None, intent=None):
    return {"sentencePlanId": "sp-1", "role": role, "actorId": None, "speakerId": None,
            "sourceFactIds": facts or [], "sourceEventIds": events or [], "speechEventIds": speech or [],
            "licensedRenderingDetailIds": lic or [],
            "plainFunction": "f", "plainFunctionSourceAuthorityIds": ["fact.a"],
            "plainIntent": intent, "plainIntentSourceAuthorityIds": (["fact.a"] if intent else []),
            "changesState": changes}
def scene(mode, plans, sid="sc-1"):
    return {"scenePlanId": sid, "sceneMode": mode, "sentencePlans": plans}

check("T08 harness: sentence plan with no source/license anchoring rejected",
      V_sh.is_valid(scene("setup", [plan("orientation", False), plan("in_world_stop", False, facts=["fact.a"])])), expect=False)
check("T09 harness: setup containing a change-claiming role rejected",
      V_sh.is_valid(scene("setup", [plan("orientation", False, facts=["fact.a"]), plan("resolved_consequence", True, events=["event.a"])])), expect=False)
check("T10 harness: valid setup plan (orientation + in-world stop, changesState all false) accepted",
      V_sh.is_valid(scene("setup", [plan("orientation", False, facts=["fact.a"]), plan("in_world_stop", False, facts=["fact.a"])])))
check("T11 harness: turn missing action/reaction/consequence roles rejected",
      V_sh.is_valid(scene("turn", [plan("orientation", False, facts=["fact.a"]), plan("in_world_stop", False, facts=["fact.a"])])), expect=False)
dlg_general = plan("licensed_dialogue", False, events=["event.a"], intent="ask")
dlg_general["speakerId"] = "entity.a"
check("T12 harness (AC-DLG-01): licensed_dialogue bound only to a GENERAL event rejected",
      V_sh.is_valid(scene("setup", [plan("orientation", False, facts=["fact.a"]), dlg_general, plan("in_world_stop", False, facts=["fact.a"])])), expect=False)
dlg_speech = plan("licensed_dialogue", False, speech=["event.speech.a"], intent="ask")
dlg_speech["speakerId"] = "entity.a"
check("T13 harness (AC-DLG-01): licensed_dialogue bound to typed speech event accepted",
      V_sh.is_valid(scene("setup", [plan("orientation", False, facts=["fact.a"]), dlg_speech, plan("in_world_stop", False, facts=["fact.a"])])))
leaky = plan("orientation", False, facts=["fact.a"], speech=["event.speech.a"])
check("T14 harness: non-dialogue role carrying speechEventIds rejected",
      V_sh.is_valid(scene("setup", [leaky, plan("in_world_stop", False, facts=["fact.a"])])), expect=False)
print()

# ---------- 7. input envelope behavior ----------
mf = {"sceneMode": "setup", "languageProfileId": "en-penelope-v1",
      "referenceReceiptId": "creator-craft-reference-2026-07-17-01",
      "focalActorId": "entity.a",
      "presentActors": [{"entityId": "entity.a", "renderDescriptor": "d", "sourceFactIds": ["fact.a"]}],
      "visibleFacts": [{"factId": "fact.a", "renderText": "t"}], "resolvedEvents": [],
      "authorizedActionEventIds": [], "authorizedReactionEventIds": [], "authorizedChangeEventIds": [],
      "authorizedAnchors": [], "licensedRenderingDetails": [],
      "styleStateId": "en-penelope-state-baseline", "reservedActionIds": []}
priv = {"forbiddenKnowledgeIds": [], "forbiddenInferenceRuleIds": [], "creatorOnlyReviewNoteIds": []}
check("T15 input: valid envelope (modelFacing + privateValidation) accepted",
      V_inp.is_valid({"modelFacing": mf, "privateValidation": priv}))
mf_bad = dict(mf); mf_bad["forbiddenKnowledgeIds"] = ["k.1"]
check("T16 input: private field inside modelFacing rejected",
      V_inp.is_valid({"modelFacing": mf_bad, "privateValidation": priv}), expect=False)
mf_turn = dict(mf); mf_turn["sceneMode"] = "turn"
check("T17 input: turn without authorized beat events rejected",
      V_inp.is_valid({"modelFacing": mf_turn, "privateValidation": priv}), expect=False)
print()

# ---------- 8. output / envelope root separation ----------
model_out = {"planReceipt": [
                {"sentencePlanId": "sp-1", "role": "orientation", "sourceFactIds": ["fact.a"],
                 "sourceEventIds": [], "speechEventIds": [], "licensedRenderingDetailIds": []},
                {"sentencePlanId": "sp-2", "role": "in_world_stop", "sourceFactIds": ["fact.a"],
                 "sourceEventIds": [], "speechEventIds": [], "licensedRenderingDetailIds": []}],
             "readerProse": {"format": "english_prose_paragraphs",
                             "paragraphs": [{"paragraphId": "p-1", "sentencePlanIds": ["sp-1", "sp-2"], "text": "x"}]}}
check("T18 output root: ModelNarrationOutput alone validates (no renderAudit required or allowed)", V_out.is_valid(model_out))
model_out_with_audit = dict(model_out); model_out_with_audit["renderAudit"] = {"generatedBy": "deterministic_post_validator", "usedSourceIds": [], "findings": [], "hardPass": True, "warningCount": 0}
check("T19 output root: renderAudit inside model output rejected (separation)", V_out.is_valid(model_out_with_audit), expect=False)
envelope = {"modelOutput": model_out,
            "renderAudit": {"generatedBy": "deterministic_post_validator", "usedSourceIds": ["fact.a"],
                            "findings": [{"ruleCode": "AC-SEP-01", "severity": "info", "count": 0}],
                            "hardPass": True, "warningCount": 0}}
check("T20 envelope root: envelope with external $ref to model output validates", V_env.is_valid(envelope))
env_free_text = json.loads(json.dumps(envelope)); env_free_text["renderAudit"]["note"] = "free text"
check("T21 envelope root: free-text field inside renderAudit rejected", V_env.is_valid(env_free_text), expect=False)
dlg_receipt_general = {"sentencePlanId": "sp-3", "role": "licensed_dialogue", "sourceFactIds": [],
                       "sourceEventIds": ["event.a"], "speechEventIds": [], "licensedRenderingDetailIds": []}
bad_out = {"planReceipt": [model_out["planReceipt"][0], dlg_receipt_general], "readerProse": model_out["readerProse"]}
check("T22 output root (AC-DLG-01): dialogue receipt bound only to general event rejected", V_out.is_valid(bad_out), expect=False)
print()

# ---------- 9. content scan (limited listed-marker check) ----------
# T23 는 "열거된 public-exclusion marker 가 Markdown/JSON 산출물에 없다"만 증명한다.
# 전역적인 KH 원문 부재 / 모든 tone-bible 표현 부재 증명이 아니다(그 주장 범위 밖).
# marker 정의는 이 detector 스크립트에만 존재한다(스캔 대상 .md/.json 에서는 제외됨).
md_files = [f for f in sorted(os.listdir(".")) if f.endswith((".md", ".json"))]
public_exclusion_markers = [
    "[[eldritch-seoul-rpg-tone-bible]]",
    "보이스는 속여도 시트는 못 속인다",
    "보이스는 거짓말해도 시트는 거짓말하지 않는다",
    "막차", "기생충", "합쇼체", "엘드리치", "서울 어휘", "스크린도어",
    "무임승차", "터널", "반말", "줄표", "도치 여운", "tone-bible", "톤 바이블",
]
viol = []
for f in md_files:
    t = open(f, encoding="utf-8").read()
    for m in public_exclusion_markers:
        if m in t:
            viol.append((f, m))
check("T23 content: listed public-exclusion markers absent from Markdown/JSON artifacts", not viol)
if viol: print("   violations:", viol)
print()

# ---------- 10. T24 contract-consistency (candidate-2.2) ----------
# 모든 rule 의 severity 는 severityMatrix 에 존재해야 하고,
# enforcementOwner 는 그 class 의 owners 에 허용되어야 한다. (matrix 검사만 — 문학 품질 무관)
contract = json.load(open("PENELOPE-NARRATIVE-AUTHORITY-CONTRACT.json", encoding="utf-8"))
allowed = {cls["class"]: set(cls["owners"]) for cls in contract["severityMatrix"]["classes"]}
t24_viol = [(r["id"], r["severity"], r["enforcementOwner"]) for r in contract["rules"]
            if r["severity"] not in allowed or r["enforcementOwner"] not in allowed[r["severity"]]]
check("T24 contract-consistency: every rule severity exists in severityMatrix and owner is allowed by that class", not t24_viol)
if t24_viol: print("   violations:", t24_viol)
from collections import Counter
_split = Counter(r["enforcementOwner"] for r in contract["rules"])
print(f"   contract={contract['version']} rules={len(contract['rules'])} owner-split={dict(_split)}")
print()

# ---------- summary ----------
fails = [n for s, n in results if s == "FAIL"]
print("=" * 60)
print(f"TOTAL {len(results)} checks | PASS {len(results) - len(fails)} | FAIL {len(fails)}")
if fails:
    print("FAILED:", *fails, sep="\n - ")
    sys.exit(1)
print("ALL PASS — receipt 정본은 이 출력의 저장본이다. 스키마 외 검증(의미·ID 실존·hardPass 함의)은 Codex 구현 범위.")
