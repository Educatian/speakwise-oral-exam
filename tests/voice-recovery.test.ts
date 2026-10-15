import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterTurnClient } from '../lib/services/OpenRouterTurnClient';
import { EvaluationService } from '../lib/services/EvaluationService';
import { TranscriptionService } from '../lib/services/TranscriptionService';
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
afterEach(() => vi.unstubAllGlobals());
describe('voice recovery contract', () => {
  it('rejects silent PCM and preserves speech PCM', () => {
    const service = new TranscriptionService();
    service.startAccumulating();
    service.addChunk(new Int16Array(48000).buffer);
    expect(service.consumeCurrentTurn()).toBeNull();
    service.startAccumulating();
    service.addChunk(Int16Array.from({length:16000},(_,i)=>Math.round(Math.sin(i/10)*5000)).buffer);
    expect(service.consumeCurrentTurn()?.durationMs).toBe(1000);
  });
  it('waits for microphone initialization and emits an audible interviewer turn', async () => {
    const messages:any[]=[]; let ready=false;
    const fetchMock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:'What evidence would you check?'}}]}),{headers:{'content-type':'application/json'}})).mockResolvedValueOnce(new Response(new Uint8Array([0,0,1,0]),{headers:{'content-type':'audio/pcm'}}));
    vi.stubGlobal('fetch',fetchMock);
    const client=new OpenRouterTurnClient({systemInstruction:'Ask one question.',onOpen:async()=>{await tick();ready=true;},onClose:vi.fn(),onError:vi.fn(),onMessage:m=>{messages.push(m);}});
    await client.connect(); expect(ready).toBe(true);client.sendText('Ready.');await tick();
    expect(messages[0].serverContent.outputTranscription.text).toContain('evidence');
    expect(messages[0].serverContent.modelTurn.parts[0].inlineData.mimeType).toBe('audio/pcm');
    expect(fetchMock.mock.calls.map(c=>c[0])).toEqual(['/api/llm','/api/speech']);
  });
  it('reports generation failure without pretending the interview completed',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('unavailable',{status:503})));
    const error=vi.fn(),close=vi.fn(),message=vi.fn();
    const client=new OpenRouterTurnClient({systemInstruction:'Ask',onOpen:()=>{},onClose:close,onError:error,onMessage:message});
    await client.connect();client.sendText('Ready');await tick();
    expect(error).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();expect(message).not.toHaveBeenCalled();
    client.disconnect();expect(close).not.toHaveBeenCalled();
  });
  it('discards late generation when a session is closed',async()=>{
    let finish:(r:Response)=>void=()=>{};vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{finish=r;})));
    const message=vi.fn();const client=new OpenRouterTurnClient({systemInstruction:'Ask',onOpen:()=>{},onClose:vi.fn(),onError:vi.fn(),onMessage:message});
    await client.connect();client.sendText('Ready');client.disconnect();finish(new Response(JSON.stringify({choices:[{message:{content:'Late'}}]})));await tick();expect(message).not.toHaveBeenCalled();
  });
  it('rejects empty or interviewer-only transcripts before requesting scores',async()=>{
    const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    for(const transcriptions of [[],[{speaker:'interviewer',text:'Hello'}],[{speaker:'user',text:'  '}]] ) {
      await expect(EvaluationService.evaluateTranscripts({transcriptions} as any)).rejects.toThrow('No student response');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects malformed evaluation instead of creating a zero score',async()=>{
    for (const response of [{feedback:'missing score'},{score:101,feedback:'invalid'},{score:90,feedback:''}]) {
      vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}))));
      await expect(EvaluationService.evaluateTranscripts({courseName:'Demo',transcriptions:[{speaker:'user',text:'I would check the evidence.'}]} as any)).rejects.toThrow('invalid score or feedback');
    }
  });
});
