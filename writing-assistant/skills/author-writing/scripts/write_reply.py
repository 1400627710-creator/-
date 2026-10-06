#!/usr/bin/env python3
"""Validate a host-authored reply and wrap the exact request revisions; no inference/network."""
import argparse, json
from pathlib import Path

def check(request, reply):
    if request.get('format') != 'author-writing-request' or request.get('schema') != 1:
        raise ValueError('INVALID_REQUEST')
    ctx=request['context']; job=ctx['job']
    required={'kind','message','reasons','questions','evidenceIds','memories'}
    if set(reply)-required-{'replacement'} or not required <= set(reply): raise ValueError('INVALID_REPLY_FIELDS')
    if reply['kind'] not in ('answer','candidate','ask','analysis') or not isinstance(reply['message'],str) or not reply['message']: raise ValueError('INVALID_REPLY')
    for key in ('reasons','questions','evidenceIds','memories'):
        if not isinstance(reply[key],list): raise ValueError('INVALID_REPLY_ARRAY')
    if len(reply['questions'])>5: raise ValueError('TOO_MANY_QUESTIONS')
    candidate=reply['kind']=='candidate'
    if candidate:
        if job['mode'] not in ('polish','ghostwrite') or not isinstance(reply.get('replacement'),str): raise ValueError('INVALID_CANDIDATE')
        if job['mode']=='ghostwrite' and not any(len(x.get('quote',''))>=40 for x in ctx.get('styleSamples',[])): raise ValueError('STYLE_REQUIRED')
    elif 'replacement' in reply: raise ValueError('REPLACEMENT_FORBIDDEN')
    if reply['kind']=='ask' and not reply['questions']: raise ValueError('QUESTIONS_REQUIRED')
    ids={m['id'] for m in ctx.get('memories',[])}
    if any(x not in ids for x in reply['evidenceIds']): raise ValueError('UNKNOWN_MEMORY')
    sources=[ctx['currentChapter']['context']]+ctx.get('styleSamples',[])+[e for m in ctx.get('memories',[]) for e in m.get('evidence',[])]
    for m in reply['memories']:
        if set(m)!= {'key','type','value','certainty','evidence'} or not m['key'] or not m['value']: raise ValueError('INVALID_MEMORY')
        if m['type'] not in ('plot','world','social','character','item','style','knowledge') or m['certainty'] not in ('explicit','inference') or not m['evidence']: raise ValueError('INVALID_MEMORY')
        for e in m['evidence']:
            if set(e)!= {'chapterId','rev','start','end','quote'} or not isinstance(e['start'],int) or not isinstance(e['end'],int) or e['end']<=e['start']: raise ValueError('INVALID_EVIDENCE')
            supported=False
            for src in sources:
                if src['chapterId']==e['chapterId'] and src['rev']==e['rev'] and src['start']<=e['start']<e['end']<=src['end']:
                    raw=src['quote'].encode('utf-16-le')
                    quote=raw[(e['start']-src['start'])*2:(e['end']-src['start'])*2].decode('utf-16-le')
                    if quote==e['quote']: supported=True;break
            if not supported: raise ValueError('EVIDENCE_NOT_IN_REQUEST')
    return {'format':'author-writing-reply','schema':1,'jobId':job['id'],'rev':job['rev'],'memoryRev':job['memoryRev'],'branch':job['branch'],'reply':reply}

def main():
    p=argparse.ArgumentParser();p.add_argument('--request',required=True);p.add_argument('--reply',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    try:
        request=json.loads(Path(a.request).read_text(encoding='utf-8-sig'));reply=json.loads(Path(a.reply).read_text(encoding='utf-8-sig'))
        result=check(request,reply);Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'ok':True,'output':a.output,'modelInferencePerformedByScript':False,'apiKeyRequired':False},ensure_ascii=False))
    except (ValueError,KeyError,TypeError,OSError,UnicodeError) as e:
        print(json.dumps({'ok':False,'error':str(e) if isinstance(e,ValueError) else 'INVALID_PACKET'},ensure_ascii=False));raise SystemExit(2)
if __name__=='__main__':main()
