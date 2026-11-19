#!/usr/bin/env python3
"""text_abbreviations.txt -> 簡訊縮寫字卡，合併進 ../custom_cards.json（可重複執行）。
音標：逐字母唸 = 字母名稱；唸成單字 = 以 CMUdict 查詞（pip install cmudict）。"""
import json, re, os, sys, cmudict
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT); import build_ipa
d = cmudict.dict()
LET = dict(zip('abcdefghijklmnopqrstuvwxyz', 'eɪ bi si di i ɛf dʒi eɪtʃ aɪ dʒeɪ keɪ ɛl ɛm ɛn oʊ pi kju ɑr ɛs ti ju vi ˈdʌbəlju ɛks waɪ zi'.split())) if False else {
 'a':'eɪ','b':'bi','c':'si','d':'di','e':'i','f':'ɛf','g':'dʒi','h':'eɪtʃ','i':'aɪ','j':'dʒeɪ','k':'keɪ','l':'ɛl','m':'ɛm','n':'ɛn','o':'oʊ','p':'pi','q':'kju','r':'ɑr','s':'ɛs','t':'ti','u':'ju','v':'vi','w':'ˈdʌbəlju','x':'ɛks','y':'waɪ','z':'zi'}
def ipa_from_say(say):
    out = []
    for tok in say.split():
        if len(tok) == 1 and tok.isalpha() and tok.isupper(): out.append(LET[tok.lower()]); continue
        for w in re.findall(r"[A-Za-z']+", tok):
            k = w.lower()
            if k not in d: return ''
            out.append(build_ipa.convert(d[k][0]))
    return ' '.join(out)
def pron(abbr, say):
    if say == '-': return '', ''
    if say == '':   # 逐字母唸
        letters = [c for c in abbr if c.isalpha()]
        if len(letters) != len([c for c in abbr if c not in '/&']) : return '', ''
        return ' '.join(LET[c.lower()] for c in letters), '逐字母唸'
    return ipa_from_say(say), f'唸成：{say}'
cards = json.load(open(os.path.join(ROOT, 'custom_cards.json'), encoding='utf-8'))
cards = [c for c in cards if c.get('score') != '簡訊']
n = 0; noipa = []
for line in open(os.path.join(HERE, 'text_abbreviations.txt'), encoding='utf-8'):
    if not line.strip() or line.startswith('#'): continue
    abbr, full, zh, en, zh2, cat, say = line.rstrip('\n').split('|')
    ip, how = pron(abbr, say)
    if not ip: noipa.append(abbr)
    cards.append({"word": abbr, "ipa": ip, "pos": "簡訊縮寫", "zh": zh,
                  "forms": f"全寫：{full}" + (f"（{how}）" if how else ""), "collocations": [],
                  "example_en": en, "example_zh": zh2, "score": "簡訊", "star": 0, "category": cat})
    n += 1
json.dump(cards, open(os.path.join(ROOT, 'custom_cards.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('簡訊縮寫', n, '張；總自訂卡', len(cards), '；沒有音標:', noipa)
