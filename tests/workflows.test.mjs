import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => JSON.parse(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const intake = read('workflows/lead-qualification.json');
const daily = read('workflows/daily-call-analysis.json');
const ceo = read('workflows/ceo-report.json');
const flows = [intake, daily, ceo];
const fixture = read('examples/demo-data.json');
const callback = read('examples/callback.json');
const node = (flow, name) => {
  const found = flow.nodes.find(n => n.name === name);
  assert.ok(found, `Missing node: ${name}`);
  return found;
};
const freezeDate = class extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-03T10:00:00.000Z'])); }
  static now() { return Date.parse('2026-10-03T10:00:00.000Z'); }
};
const run = (flow, name, {json = {}, items = [], named = {}} = {}) => {
  const context = vm.createContext({
    $json: structuredClone(json),
    $input: {all: () => structuredClone(items.map(json => ({json})))},
    $: name => {
      assert.ok(Object.hasOwn(named, name), `Missing synthetic upstream: ${name}`);
      const values = Array.isArray(named[name]) ? named[name] : [named[name]];
      const output = structuredClone(values.map(json => ({json})));
      return {all: () => output, first: () => output[0], item: output[0]};
    },
    Date: freezeDate
  });
  const result = new vm.Script('(function(){\n' + node(flow,name).parameters.jsCode + '\n})()')
    .runInContext(context, {timeout: 1000});
  return JSON.parse(JSON.stringify(result));
};
const phone = data => run(intake, 'Нормалізація даних ліда', {items:[data]})[0].json;
const normalize = json => run(intake, 'Нормалізація результату дзвінка', {json})[0].json;
const merge = (json, base = normalize(callback)) => run(intake, 'Об’єднання контексту та AI-оцінки', {
  json, named:{'Нормалізація результату дзвінка':base}
})[0].json;
const metrics = (leads = fixture.leads, analyses = fixture.analyses) => run(ceo, 'Розрахунок CEO-метрик', {
  named:{'Отримання даних про лідів':leads, 'Отримання аналізу дзвінків':analyses}
})[0].json;
const format = (report = fixture.ceoOutput, data = metrics()) => run(ceo, 'Формування Telegram-повідомлення', {
  json:{output:report}, named:{'Розрахунок CEO-метрик':data}
})[0].json.message;
const sampleAnalysis = changes => ({analysis_status:'analyzed', ai_score:80, result:'Успішно', lead_temperature:'Hot', duration_seconds:60,
  customer_objections:'', agent_errors:'', successful_pattern:'', next_step:'', ...changes});

test('three exports contain 12 + 7 + 10 nodes', () => assert.deepEqual(flows.map(w=>w.nodes.length), [12,7,10]));
test('all exports are inactive with no pinned execution payloads', () => {
  for(const w of flows) {assert.equal(w.active,false); assert.deepEqual(w.pinData,{});}
});
test('workflow deployment metadata and credential bindings are absent', () => {
  for(const w of flows) {
    for(const k of ['id','versionId','meta','tags','nodeGroups']) assert.equal(Object.hasOwn(w,k),false);
    for(const n of w.nodes) for(const k of ['credentials','webhookId']) assert.equal(Object.hasOwn(n,k),false);
  }
});
test('all graph edges point to existing nodes', () => {
  for(const w of flows) {
    const names = new Set(w.nodes.map(n=>n.name));
    assert.equal(names.size,w.nodes.length);
    for(const [from,ports] of Object.entries(w.connections)) {
      assert.ok(names.has(from));
      for(const outputs of Object.values(ports)) for(const edges of outputs) for(const edge of edges) {
        assert.ok(names.has(edge.node)); assert.ok(Number.isInteger(edge.index));
      }
    }
  }
});
test('expression references retain valid Ukrainian node names', () => {
  for(const w of flows) {
    const names=new Set(w.nodes.map(n=>n.name));
    for(const n of w.nodes) {
      const params=JSON.stringify(n.parameters);
      for(const match of params.matchAll(/\$\('([^']+)'\)/g)) assert.ok(names.has(match[1]), match[1]);
    }
  }
});
test('seven Sheets nodes share one placeholder workbook and two named tabs', () => {
  const sheets=flows.flatMap(w=>w.nodes.filter(n=>n.parameters.documentId));
  assert.equal(sheets.length,7);
  for(const n of sheets) {
    assert.deepEqual(n.parameters.documentId,{__rl:true,mode:'id',value:'REPLACE_WITH_REVENUEPULSE_SPREADSHEET_ID'});
    assert.equal(n.parameters.sheetName.mode,'name');
    assert.ok(['Leads','CallAnalysis'].includes(n.parameters.sheetName.value));
  }
});
test('all three model nodes retain gpt-5-mini', () => {
  const models=flows.flatMap(w=>w.nodes.filter(n=>n.type.endsWith('.lmChatOpenAi')));
  assert.equal(models.length,3); for(const n of models) assert.equal(n.parameters.model.value,'gpt-5-mini');
});
test('five actual Code nodes compile without executing integrations', () => {
  const code=flows.flatMap(w=>w.nodes.filter(n=>n.type.endsWith('.code')));
  assert.equal(code.length,5); for(const n of code) new vm.Script('(function(){'+n.parameters.jsCode+'})');
});
test('two structured parsers require all properties and disallow additional properties', () => {
  const parsers=flows.flatMap(w=>w.nodes.filter(n=>n.type.endsWith('.outputParserStructured')));
  assert.equal(parsers.length,2);
  for(const n of parsers) {
    const s=JSON.parse(n.parameters.inputSchema);
    assert.equal(s.type,'object'); assert.equal(s.additionalProperties,false);
    assert.deepEqual([...s.required].sort(),Object.keys(s.properties).sort());
  }
});
test('daily parser connects to agent and constrains score and categorical values', () => {
  const name='Структурований результат аналізу'; const s=JSON.parse(node(daily,name).parameters.inputSchema);
  assert.equal(s.required.length,15);
  assert.deepEqual(s.properties.ai_score,{type:'integer',minimum:0,maximum:100});
  assert.deepEqual(s.properties.result.enum,['Успішно','Частково','Неуспішно']);
  assert.deepEqual(s.properties.lead_temperature.enum,['Cold','Warm','Hot']);
  assert.equal(daily.connections[name].ai_outputParser[0][0].node,'AI-аналіз голосової розмови');
});
test('CEO parser connects to agent and enumerates three statuses', () => {
  const name='Структурований CEO-звіт'; const s=JSON.parse(node(ceo,name).parameters.inputSchema);
  assert.equal(s.required.length,7);
  assert.deepEqual(s.properties.overall_status.enum,['Green','Yellow','Red']);
  assert.equal(ceo.connections[name].ai_outputParser[0][0].node,'AI-формування CEO-звіту');
});
test('HAPP assistant and Telegram destination are placeholders', () => {
  assert.equal(node(intake,'Запуск дзвінка HAPP').parameters.url,'https://api.happ.tools/api/assistants/REPLACE_WITH_HAPP_ASSISTANT_ID/originate');
  assert.equal(node(ceo,'Надсилання CEO-звіту в Telegram').parameters.chatId,'REPLACE_WITH_TELEGRAM_CHAT_ID');
});
test('sanitized exports contain no cached resource URLs or common secret literals', () => {
  const text=JSON.stringify(flows);
  assert.doesNotMatch(text,/cachedResultUrl|docs\.google\.com\/spreadsheets\/d\//);
  assert.doesNotMatch(text,/(sk-(?:proj-)?[A-Za-z0-9_-]{15,}|gh[pousr]_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]+|-----BEGIN .*PRIVATE KEY-----)/);
  assert.doesNotMatch(text,/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
});
test('outbound and callback are separate trigger paths with a two-minute delay', () => {
  assert.deepEqual(node(intake,'Очікування 2 хвилини').parameters,{amount:2,unit:'minutes'});
  assert.equal(intake.connections['Очікування 2 хвилини'].main[0][0].node,'Запуск дзвінка HAPP');
  assert.equal(Object.hasOwn(intake.connections,'Запуск дзвінка HAPP'),false);
  assert.equal(node(intake,'Вебхук результату дзвінка HAPP').parameters.path,'revenuepulse-demo-callback');
});
test('known limitation: invalid-phone IF has no connected false path', () => {
  assert.ok(!intake.connections['Перевірка номера телефону'].main[1]?.length);
});
test('known limitation: callback authentication and missing-ID gate are absent', () => {
  assert.equal(node(intake,'Вебхук результату дзвінка HAPP').parameters.authentication,undefined);
  assert.equal(intake.nodes.filter(n=>n.type.endsWith('.if')).length,1);
  for(const w of flows) assert.equal(w.settings.errorWorkflow,undefined);
});
test('daily loop continues from write and has an unconnected done branch', () => {
  const ports=daily.connections['Обробка транскрипцій по черзі'].main;
  assert.deepEqual(ports[0],[]); assert.equal(ports[1][0].node,'AI-аналіз голосової розмови');
  assert.equal(daily.connections['Збереження результату аналізу'].main[0][0].node,'Обробка транскрипцій по черзі');
});
test('queue and analysis writes match conversation_id and transition pending to analyzed', () => {
  const queue=node(intake,'Додавання дзвінка до черги аналізу').parameters.columns;
  const done=node(daily,'Збереження результату аналізу').parameters.columns;
  for(const c of [queue,done]) assert.deepEqual(c.matchingColumns,['conversation_id']);
  assert.equal(queue.value.analysis_status,'pending'); assert.equal(done.value.analysis_status,'analyzed');
});
test('known limitation: daily transcript mapping points to summary', () => {
  assert.equal(node(daily,'Збереження результату аналізу').parameters.columns.value.transcript,"={{ $('Обробка транскрипцій по черзі').item.json.summary }}");
  assert.equal(node(intake,'Додавання дзвінка до черги аналізу').parameters.columns.value.summary,undefined);
});
test('known limitation: initial text retains double-equals expression prefix', () => {
  assert.ok(node(intake,'AI-аналіз BANT і скоринг').parameters.text.startsWith('=={{'));
});
test('schedule source fields retained without assuming an instance timezone', () => {
  assert.deepEqual(node(daily,'Щоденний запуск аналізу').parameters.rule.interval,[{triggerAtHour:9,triggerAtMinute:10}]);
  assert.deepEqual(node(ceo,'Щотижневий запуск CEO-звіту').parameters.rule.interval,[{field:'weeks',triggerAtDay:[5],triggerAtHour:19}]);
  for(const w of flows) assert.equal(w.settings.timezone,undefined);
});

test('international phone formatting preserves a plus and strips punctuation', () => {
  const r=phone({lead_key:' DEMO-001 ',phone:'+1 (202) 555-0123'});
  assert.equal(r.phone,'+12025550123'); assert.equal(r.lead_id,'DEMO-001'); assert.equal(r.is_valid_phone,true);
});
test('00 prefix becomes plus', () => assert.equal(phone({phone:'0012025550123'}).phone,'+12025550123'));
test('Spanish nine-digit national number gets +34', () => {
  const r=phone({phone:'612 345 678'}); assert.equal(r.phone,'+34612345678'); assert.equal(r.is_valid_phone,true);
});
test('existing 34 prefix is not duplicated', () => assert.equal(phone({phone:'34612345678'}).phone,'+34612345678'));
test('empty and too-short phone formats are rejected', () => {
  assert.equal(phone({}).is_valid_phone,false); assert.equal(phone({phone:'123'}).is_valid_phone,false);
});
test('lead_id fallback and default scenario are populated', () => {
  const r=phone({lead_id:' DEMO-002 '}); assert.equal(r.lead_key,'DEMO-002'); assert.equal(r.scenario,'BANT-кваліфікація нового ліда');
});
test('known limitation: whitespace lead_key suppresses lead_id fallback', () => assert.equal(phone({lead_key:' ',lead_id:'DEMO-002'}).lead_id,''));

test('synthetic callback yields protected identity and joined transcript', () => {
  const r=normalize(callback); assert.equal(r.lead_id,'DEMO-001'); assert.equal(r.conversation_id,'demo-conversation-001');
  assert.equal(r.duration_seconds,120); assert.equal(r.human_handoff,true); assert.equal(r.has_lead_id,true);
  assert.match(r.transcript,/Агент:.*\nКлієнт:/);
});
test('normalizer accepts nested data and camel-case dynamic variables', () => {
  const r=normalize({body:{data:{dynamicVariables:{lead_id:'DEMO-007'},transcript:'  Demo transcript ',conversation_id:'demo-007'}}});
  assert.equal(r.lead_id,'DEMO-007'); assert.equal(r.transcript,'Demo transcript'); assert.equal(r.conversation_id,'demo-007');
});
test('end_call JSON reason supplies next-step fallback', () => {
  const r=normalize({transcript:[{role:'agent',message:'',tool_calls:[{tool_name:'end_call',params_as_json:'{"reason":"Demo next step"}'}]}]});
  assert.equal(r.next_step,'Demo next step'); assert.equal(r.transcript,'');
});
test('malformed end_call JSON does not crash callback normalization', () => {
  const r=normalize({transcript:[{tool_calls:[{tool_name:'end_call',params_as_json:'not-json'}]}]}); assert.equal(r.next_step,'');
});
test('callback scores clamp to 0–100 and absent score stays null', () => {
  assert.equal(normalize({params:{ai_score:999}}).ai_score,100);
  assert.equal(normalize({params:{ai_score:-5}}).ai_score,0); assert.equal(normalize({}).ai_score,null);
});
test('callback true string is normalized with whitespace', () => assert.equal(normalize({params:{human_handoff:' TRUE '}}).human_handoff,true));
test('absent callback identifiers are signaled but not rejected', () => {
  const r=normalize({}); assert.equal(r.has_lead_id,false); assert.equal(r.lead_id,''); assert.equal(r.conversation_id,'');
});
test('known limitation: empty dynamic key suppresses report fallback', () => assert.equal(normalize({dynamic_variables:{lead_key:''},params:{lead_key:'DEMO-002'}}).lead_id,''));
test('known limitation: negative finite callback duration is preserved', () => assert.equal(normalize({duration_seconds:-5}).duration_seconds,-5));

test('merge parses fenced model JSON', () => {
  const r=merge({text:'```json\n{"ai_score":80,"summary":"Demo"}\n```'}); assert.equal(r.ai_score,80); assert.equal(r.summary,'Demo');
});
test('merge protects identity and transcript against model overwrites', () => {
  const base=normalize(callback); const r=merge({output:{lead_id:'other',transcript:'changed',duration_seconds:999,conversation_id:'other',ai_score:80}},base);
  for(const k of ['lead_id','phone','client_name','company','transcript','duration_seconds','conversation_id']) assert.equal(r[k],base[k]);
});
test('merge clamps score but does not enforce an integer', () => {
  assert.equal(merge({output:{ai_score:120}}).ai_score,100);
  assert.equal(merge({output:{ai_score:-10}}).ai_score,0);
  assert.equal(merge({output:{ai_score:68.5}}).ai_score,68.5);
});
test('initial temperature fallback boundaries are 75 and 45', () => {
  for(const [score,temp] of [[75,'Hot'],[74,'Warm'],[45,'Warm'],[44,'Cold']]) assert.equal(merge({output:{ai_score:score}}).lead_temperature,temp);
});
test('known limitation: model temperature overrides numeric fallback', () => assert.equal(merge({output:{ai_score:10,lead_temperature:'Hot'}}).lead_temperature,'Hot'));
test('invalid model JSON throws rather than silently creating success', () => assert.throws(()=>merge({text:'invalid demo json'}),/AI повернув невалідний JSON/));
test('known limitation: missing score becomes zero and JSON null throws', () => {
  assert.equal(merge({text:'{}'}).ai_score,0); assert.throws(()=>merge({text:'null'}),/ai_score/);
});
test('merge supports boolean and exact true string handoff', () => {
  assert.equal(merge({output:{human_handoff:true}}).human_handoff,true);
  assert.equal(merge({output:{human_handoff:'TRUE'}}).human_handoff,true);
  assert.equal(merge({output:{human_handoff:' TRUE '}}).human_handoff,false);
});

test('synthetic CEO sample reproduces 6 leads, 5 analyzed, mean 68 and call-success share 40%', () => {
  const r=metrics();
  assert.equal(r.total_leads,6); assert.equal(r.completed_calls,5); assert.equal(r.analyzed_calls,5);
  assert.equal(r.average_ai_score,68); assert.equal(r.conversion_rate,40);
});
test('outcome and temperature counts use analyzed rows only', () => {
  const r=metrics(); assert.deepEqual([r.successful_calls,r.partial_calls,r.unsuccessful_calls],[2,2,1]);
  assert.deepEqual([r.hot_leads,r.warm_leads,r.cold_leads],[3,1,1]);
});
test('unique non-empty narrative values are deduplicated', () => {
  const r=metrics(); assert.deepEqual(r.customer_objections,['Потрібно уточнити бюджет','Не на часі']);
  assert.deepEqual(r.successful_patterns,['Уточнення наступного кроку']);
});
test('empty populations produce zero counts and empty narrative lists', () => {
  const r=metrics([],[]); assert.equal(r.average_ai_score,0); assert.equal(r.conversion_rate,0); assert.equal(r.analyzed_calls,0);
  assert.deepEqual(r.customer_objections,[]);
});
test('status normalization trims and ignores case; completed is not done', () => {
  const r=metrics([{call_status:' DONE ',human_handoff:' TRUE '},{call_status:'completed'}],[sampleAnalysis({analysis_status:' ANALYZED ',result:' УСПІШНО '})]);
  assert.equal(r.completed_calls,1); assert.equal(r.human_handoffs,1); assert.equal(r.successful_calls,1);
});
test('decimal comma scores are accepted and invalid strings are excluded', () => {
  const r=metrics([],[sampleAnalysis({ai_score:'68,5'}),sampleAnalysis({ai_score:'invalid'})]); assert.equal(r.average_ai_score,69);
});
test('known limitation: empty/null score contributes zero to mean', () => {
  const r=metrics([],[sampleAnalysis({ai_score:80}),sampleAnalysis({ai_score:''}),sampleAnalysis({ai_score:null})]); assert.equal(r.average_ai_score,27);
});
test('known limitation: out-of-range finite score is not clamped by metrics', () => assert.equal(metrics([],[sampleAnalysis({ai_score:150})]).average_ai_score,150));
test('known limitation: historical dates are not filtered', () => {
  const r=metrics([],[sampleAnalysis({analysis_date:'2000-01-01'})]); assert.equal(r.analyzed_calls,1);
  assert.equal(r.period_start,undefined); assert.equal(r.period_end,undefined); assert.equal(r.report_date,'2026-10-03T10:00:00.000Z');
});
test('known limitation: duplicate conversations are counted as rows', () => {
  const a=sampleAnalysis({conversation_id:'same'}); assert.equal(metrics([],[a,a]).analyzed_calls,2);
});
test('known limitation: absent narrative values become literal strings', () => {
  const r=metrics([],[sampleAnalysis({customer_objections:undefined}),sampleAnalysis({customer_objections:null})]);
  assert.deepEqual(r.customer_objections,['undefined','null']);
});
test('known limitation: numeric zero duration is missing but string zero is not', () => {
  assert.equal(metrics([],[sampleAnalysis({duration_seconds:0}),sampleAnalysis({duration_seconds:'0'})]).missing_duration_count,1);
});
test('metrics do not mutate synthetic upstream data', () => {
  const before=JSON.stringify(fixture); metrics(); assert.equal(JSON.stringify(fixture),before);
});

test('Telegram uses calculated metrics, Ukrainian headings and selected status', () => {
  const message=format(); assert.match(message,/CEO-звіт \| 2026-10-03/); assert.match(message,/🟡 <b>Потрібна увага<\/b>/);
  assert.match(message,/40%/); assert.match(message,/AI Score: <b>68<\/b>/); assert.match(message,/2\/5/);
});
test('Telegram escapes untrusted HTML in generated narrative', () => {
  const message=format({...fixture.ceoOutput,executive_summary:'<script>& demo'});
  assert.ok(message.includes('&lt;script&gt;&amp; demo')); assert.ok(!message.includes('<script>'));
});
test('Telegram renders only two risks and recommendations', () => {
  const message=format({...fixture.ceoOutput,risks:['Risk one','Risk two','Risk three'],recommendations:['Action one','Action two','Action three']});
  assert.ok(message.includes('Risk two')); assert.ok(!message.includes('Risk three')); assert.ok(!message.includes('Action three'));
});
test('Telegram shortens summary and priority fields', () => {
  const message=format({...fixture.ceoOutput,executive_summary:'X'.repeat(400),priority_action:'Y'.repeat(300)});
  assert.ok(message.includes('X'.repeat(350)+'…')); assert.ok(!message.includes('X'.repeat(351)));
  assert.ok(message.includes('Y'.repeat(250)+'…'));
});
test('Telegram gives fallbacks for empty lists and unknown status', () => {
  const message=format({...fixture.ceoOutput,overall_status:'Unknown',risks:[],recommendations:[]});
  assert.ok(message.includes('Немає оцінки')); assert.ok(message.includes('Немає суттєвих'));
});
test('Telegram does not render headline or key insights and sends HTML', () => {
  const message=format({...fixture.ceoOutput,headline:'HIDDEN_HEADLINE',key_insights:['HIDDEN_INSIGHT']});
  assert.ok(!message.includes('HIDDEN_')); assert.equal(node(ceo,'Надсилання CEO-звіту в Telegram').parameters.additionalFields.parse_mode,'HTML');
});
