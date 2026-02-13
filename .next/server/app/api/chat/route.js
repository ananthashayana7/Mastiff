(()=>{var e={};e.id=276,e.ids=[276],e.modules={10846:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},44870:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},3295:e=>{"use strict";e.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},29294:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-async-storage.external.js")},63033:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},12412:e=>{"use strict";e.exports=require("assert")},79428:e=>{"use strict";e.exports=require("buffer")},79646:e=>{"use strict";e.exports=require("child_process")},55511:e=>{"use strict";e.exports=require("crypto")},94735:e=>{"use strict";e.exports=require("events")},29021:e=>{"use strict";e.exports=require("fs")},79748:e=>{"use strict";e.exports=require("fs/promises")},81630:e=>{"use strict";e.exports=require("http")},55591:e=>{"use strict";e.exports=require("https")},91645:e=>{"use strict";e.exports=require("net")},21820:e=>{"use strict";e.exports=require("os")},33873:e=>{"use strict";e.exports=require("path")},19771:e=>{"use strict";e.exports=require("process")},11723:e=>{"use strict";e.exports=require("querystring")},27910:e=>{"use strict";e.exports=require("stream")},34631:e=>{"use strict";e.exports=require("tls")},83997:e=>{"use strict";e.exports=require("tty")},79551:e=>{"use strict";e.exports=require("url")},28354:e=>{"use strict";e.exports=require("util")},73566:e=>{"use strict";e.exports=require("worker_threads")},74075:e=>{"use strict";e.exports=require("zlib")},64939:e=>{"use strict";e.exports=import("pg")},4573:e=>{"use strict";e.exports=require("node:buffer")},73024:e=>{"use strict";e.exports=require("node:fs")},37067:e=>{"use strict";e.exports=require("node:http")},44708:e=>{"use strict";e.exports=require("node:https")},77030:e=>{"use strict";e.exports=require("node:net")},76760:e=>{"use strict";e.exports=require("node:path")},1708:e=>{"use strict";e.exports=require("node:process")},57075:e=>{"use strict";e.exports=require("node:stream")},46466:e=>{"use strict";e.exports=require("node:stream/promises")},37830:e=>{"use strict";e.exports=require("node:stream/web")},73136:e=>{"use strict";e.exports=require("node:url")},57975:e=>{"use strict";e.exports=require("node:util")},38522:e=>{"use strict";e.exports=require("node:zlib")},39727:()=>{},47990:()=>{},47627:(e,t,s)=>{"use strict";s.a(e,async(e,r)=>{try{s.r(t),s.d(t,{patchFetch:()=>u,routeModule:()=>c,serverHooks:()=>h,workAsyncStorage:()=>d,workUnitAsyncStorage:()=>p});var a=s(42706),i=s(28203),n=s(45994),o=s(91221),l=e([o]);o=(l.then?(await l)():l)[0];let c=new a.AppRouteRouteModule({definition:{kind:i.RouteKind.APP_ROUTE,page:"/api/chat/route",pathname:"/api/chat",filename:"route",bundlePath:"app/api/chat/route"},resolvedPagePath:"/workspaces/Mastiff/src/app/api/chat/route.ts",nextConfigOutput:"",userland:o}),{workAsyncStorage:d,workUnitAsyncStorage:p,serverHooks:h}=c;function u(){return(0,n.patchFetch)({workAsyncStorage:d,workUnitAsyncStorage:p})}r()}catch(e){r(e)}})},96487:()=>{},78335:()=>{},91221:(e,t,s)=>{"use strict";s.a(e,async(e,r)=>{try{s.r(t),s.d(t,{POST:()=>p,dynamic:()=>h});var a=s(39187),i=s(43345),n=s(28474),o=s(47579),l=s(92489),u=s(84888),c=s(71330),d=e([i]);i=(d.then?(await d)():d)[0];let h="force-dynamic";async function p(e){try{let{sessionId:t,content:s,mode:r="standard",silent:d=!1}=await e.json();if(!t||!s)return a.NextResponse.json({error:"Missing sessionId or content"},{status:400});let p=["chat","analysis"].includes(r)?r:"analysis",h=await i.db.query.sessions.findFirst({where:(0,o.eq)(n.sessions.id,t),with:{files:!0,messages:{orderBy:(0,l.Y)(n.messages.createdAt)}}});if(!h)return a.NextResponse.json({error:"Session not found"},{status:404});d||await i.db.insert(n.messages).values({sessionId:t,role:"user",content:s});let m=h.files;if(m.length>0){let e=m.map(e=>({name:e.filename,schema:JSON.stringify(e.metadata,null,2),sample:e.metadata?.sample||[]})),r=m.map(e=>({name:e.filename,path:e.filePath})),l=await u.i.getAnalysisCode(s,e,h.messages,p),d=await c.j.execute(t,l.code,r),[f]=await i.db.insert(n.messages).values({sessionId:t,role:"assistant",content:l.explanation,code:l.code,result:{output:d.result,error:d.error,charts:d.charts,plotly_charts:d.plotly_charts,updated_df_sample:d.updated_df_sample},visualizationUrl:d.charts?.[0]?`data:image/png;base64,${d.charts[0]}`:null}).returning();return 0===h.messages.length&&await i.db.update(n.sessions).set({title:s.slice(0,50),updatedAt:new Date}).where((0,o.eq)(n.sessions.id,t)),a.NextResponse.json(f)}{let e=await u.i.chat(s,h.messages,p),[r]=await i.db.insert(n.messages).values({sessionId:t,role:"assistant",content:e}).returning();return 0===h.messages.length&&await i.db.update(n.sessions).set({title:s.slice(0,50),updatedAt:new Date}).where((0,o.eq)(n.sessions.id,t)),a.NextResponse.json(r)}}catch(e){return console.error("Chat API Error:",e),a.NextResponse.json({error:e.message||"An error occurred during analysis",content:`I encountered an error while processing your request: ${e.message}. Please try again.`,role:"assistant",id:`error-${Date.now()}`},{status:500})}}r()}catch(e){r(e)}})},43345:(e,t,s)=>{"use strict";s.a(e,async(e,r)=>{try{s.d(t,{db:()=>u});var a=s(78915),i=s(64939),n=s(28474),o=e([i,a]);[i,a]=o.then?(await o)():o;let l=new i.Pool({connectionString:process.env.DATABASE_URL}),u=(0,a.f)(l,{schema:n});r()}catch(e){r(e)}})},28474:(e,t,s)=>{"use strict";s.r(t),s.d(t,{files:()=>h,filesRelations:()=>y,messages:()=>m,messagesRelations:()=>x,sessions:()=>p,sessionsRelations:()=>g,users:()=>d,usersRelations:()=>f});var r=s(92834),a=s(60011),i=s(99063),n=s(44799),o=s(32590),l=s(92543),u=s(57102),c=s(95937);let d=(0,r.cJ)("users",{id:(0,a.uR)("id").primaryKey().defaultRandom(),email:(0,i.yf)("email",{length:255}).unique().notNull(),name:(0,i.yf)("name",{length:255}),passwordHash:(0,n.Qq)("password_hash"),createdAt:(0,o.vE)("created_at").defaultNow()}),p=(0,r.cJ)("sessions",{id:(0,a.uR)("id").primaryKey().defaultRandom(),userId:(0,a.uR)("user_id").references(()=>d.id),title:(0,i.yf)("title",{length:255}),createdAt:(0,o.vE)("created_at").defaultNow(),updatedAt:(0,o.vE)("updated_at").defaultNow()}),h=(0,r.cJ)("files",{id:(0,a.uR)("id").primaryKey().defaultRandom(),userId:(0,a.uR)("user_id").references(()=>d.id),sessionId:(0,a.uR)("session_id").references(()=>p.id),filename:(0,i.yf)("filename",{length:255}).notNull(),fileType:(0,i.yf)("file_type",{length:50}).notNull(),filePath:(0,i.yf)("file_path",{length:500}).notNull(),fileSize:(0,l.nd)("file_size"),metadata:(0,u.Fx)("metadata"),createdAt:(0,o.vE)("created_at").defaultNow()}),m=(0,r.cJ)("messages",{id:(0,a.uR)("id").primaryKey().defaultRandom(),sessionId:(0,a.uR)("session_id").references(()=>p.id),role:(0,i.yf)("role",{length:20}).notNull(),content:(0,n.Qq)("content").notNull(),code:(0,n.Qq)("code"),result:(0,u.Fx)("result"),visualizationUrl:(0,n.Qq)("visualization_url"),createdAt:(0,o.vE)("created_at").defaultNow()}),f=(0,c.K1)(d,({many:e})=>({sessions:e(p)})),g=(0,c.K1)(p,({one:e,many:t})=>({user:e(d,{fields:[p.userId],references:[d.id]}),messages:t(m),files:t(h)})),y=(0,c.K1)(h,({one:e})=>({session:e(p,{fields:[h.sessionId],references:[p.id]})})),x=(0,c.K1)(m,({one:e})=>({session:e(p,{fields:[m.sessionId],references:[p.id]})}))},71330:(e,t,s)=>{"use strict";s.d(t,{j:()=>o});var r=s(79646),a=s(33873),i=s.n(a);class n{processes=new Map;async execute(e,t,s){let r=0;for(;r<=2;)try{let r=this.processes.get(e);return(!r||r.killed||null!==r.exitCode)&&(r=this.startKernel(e),this.processes.set(e,r)),await this.sendRequest(r,t,s,e)}catch(t){if(r++,console.error(`Kernel [${e}] execution failed (attempt ${r}):`,t.message),this.terminate(e),r>2)return{success:!1,result:"",error:`Analysis failed after 3 attempts: ${t.message}`,charts:[],plotly_charts:[]}}}sendRequest(e,t,s,r){return new Promise((r,a)=>{let i;let n=JSON.stringify({code:t,files_json:JSON.stringify(s.map(e=>({...e,path:e.path.replace(/\\/g,"/")})))})+"\n",o="",l=t=>{for(let s of(o+=t.toString()).split("\n").filter(e=>e.trim()))try{let t=JSON.parse(s.trim());clearTimeout(i),e.stdout?.removeListener("data",l),e.removeListener("error",u),r(t);return}catch{}},u=t=>{clearTimeout(i),e.stdout?.removeListener("data",l),a(t)};i=setTimeout(()=>{e.stdout?.removeListener("data",l),e.removeListener("error",u),a(Error("Analysis timed out after 60s"))},6e4),e.on("error",u),e.stdout?.on("data",l);try{e.stdin?.write(n)}catch(e){clearTimeout(i),a(Error("Failed to write to kernel process"))}})}startKernel(e){let t=i().join(process.cwd(),"src","services","kernel_bridge.py"),s=null,a=null;for(let i of["py","python3","python"])try{if((s=(0,r.spawn)(i,[t],{stdio:["pipe","pipe","pipe"],env:{...process.env,PYTHONUNBUFFERED:"1"}})).pid){console.log(`Kernel [${e}] started with ${i} (PID: ${s.pid})`);break}}catch(e){a=e;continue}if(!s)throw Error(`Failed to start Python kernel: ${a?.message}`);return s.stderr?.on("data",t=>{let s=t.toString().trim();s&&console.error(`Kernel [${e}] stderr:`,s)}),s.on("close",t=>{console.log(`Kernel [${e}] closed with code ${t}`),this.processes.delete(e)}),s.on("error",t=>{console.error(`Kernel [${e}] process error:`,t),this.processes.delete(e)}),s}terminate(e){let t=this.processes.get(e);if(t){try{t.kill("SIGTERM"),setTimeout(()=>{try{t.kill("SIGKILL")}catch{}},3e3)}catch{}this.processes.delete(e)}}terminateAll(){for(let[e]of this.processes)this.terminate(e)}}let o=new n},84888:(e,t,s)=>{"use strict";s.d(t,{i:()=>n});var r=s(80139);let a={chat:{temperature:.5,promptPrefix:`MODE: DEFAULT CHAT — High-IQ conversational reasoning.
- Goal: Answer general questions, explain concepts, and guide the user.
- Rules: Be helpful and precise. Suggest data analysis if relevant.
- Context: You are Mastiff, the ultimate AI data partner.`,maxHistorySlice:10},analysis:{temperature:.2,promptPrefix:`MODE: BOARDROOM ANALYST — Agentic Zero-Filler Science.
- ZERO-INTRO RULE: Do NOT start with "I performed a scan..." or "This was complex...". Start IMMEDIATELY with insights.
- NO META-TALK: Explicitly FORBIDDEN from discussing headers, delimiters, parsing, or data cleaning.
- COMPUTATIONAL TRUTH: 100% of math must be via Python. If a value like -1,000,000 repeats identically, DO NOT report it as a trend—flag it as a "Data Integrity Warning".
- FORENSIC STYLE: Output must be crisp, boardroom-ready, and void of AI personality or apologies.
- MANDATORY VISUAL: You MUST generate exactly ONE high-fidelity Plotly chart (px or go). 
- To show a Plotly chart, assign the figure to 'result' (e.g., result = px.bar(...)).`,maxHistorySlice:8}};class i{genAI=null;getClient(){if(!this.genAI){let e=process.env.API_KEY;if(!e){if("phase-production-build"===process.env.NEXT_PHASE)return null;throw Error("API_KEY must be set when using the Gemini API.")}this.genAI=new r.M4({apiKey:e})}return this.genAI}async getAnalysisCode(e,t,s,r="analysis"){let i=this.getClient();if(!i)throw Error("AI client not initialized");let n=a[r],o=t.map(e=>`
--- FILE: ${e.name} ---
Schema:
${e.schema}
Sample (first 5 rows):
${JSON.stringify(e.sample,null,2)}
`).join("\n"),l=`
You are MASTIFF, an elite financial data science agent. You match the best analysis platforms (Julius.ai, ChatGPT Data Analyst).

${n.promptPrefix}

CONTEXT:
The user has provided the following datasets:
${o}

CAPABILITIES:
- Libraries: pandas, numpy, matplotlib, seaborn, scipy, statsmodels, sklearn, plotly.
- Persistence: This is a STATEFUL kernel. Your variables and imports persist.
- Interactive Charts: You can use 'plotly.express' (px) or 'plotly.graph_objects' (go).
- To show a Plotly chart, assign it to 'result' or append it to 'plotly_json'.
- Seaborn/Matplotlib: Still supported for static high-fidelity charts.

FINANCIAL DATA INTELLIGENCE:
- Treat all monetary columns with care: format with proper currency symbols and precision.
- When asked about a time period (e.g. "Q3", "last month", "2024"), parse dates correctly and filter the data.
- When asked about categories (e.g. "by region", "for product X"), group and filter accordingly.
- Detect anomalies: flag outliers, sudden spikes/drops, and unusual distributions.
- Always provide confidence context — don't overstate conclusions from small samples.
- Cross-reference related columns when available (e.g. cost vs revenue for margins).

CHART STYLING (CRITICAL — PLOTLY ONLY):
- Use the following color palette for all traces: ['#E50914', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7']
- Always add clear titles, axis labels, and hover data.
- Default to 'plotly_dark' template (already set in kernel).
- Assign your final figure to 'result'.

NATURAL LANGUAGE QUERY HANDLING:
- The user may ask questions in plain English about their data.
- Examples: "What were our top 5 expenses in March?", "Compare Q1 vs Q2 revenue", "Show me the trend over time"
- Always interpret the intent, identify relevant columns, filter data, and present results.
- If the query is ambiguous, analyze the most likely interpretation and state your assumption.

RESPONSE FORMAT (JSON ONLY):
{
  "explanation": "Expert-level summary of your approach and findings. Use markdown formatting (headings, bold, lists, tables) for clarity.",
  "code": "Python code. Use 'dfs[\\\\"filename\\\\"]', 'df', 'px', 'go'.",
  "requires_visualization": true
}

CODE RULES:
- IMPORTANT: Use 'dfs["filename"]' to access specific files.
- Use 'result = ...' to return your findings.
- Always handle NaNs and data types before analysis.
- Be proactive: if a visualization adds value, create it even if not explicitly asked.
- For string operations, always use .astype(str) first to avoid type errors.
- For date operations, always parse with pd.to_datetime() first and handle errors='coerce'.
- When creating multiple charts, use plt.figure() for each to avoid overlapping.

AI RESPONSE RULES:
- IMPORTANT: Return ONLY valid JSON. 
- All string values (explanation, code) MUST be properly escaped (
 for newlines, " for quotes).
- Ensure the JSON is complete and not truncated.
`,u=s.slice(-n.maxHistorySlice).map(e=>({role:"assistant"===e.role?"model":"user",parts:[{text:e.content}]}));try{let t=(await i.models.generateContent({model:"gemini-2.0-flash",contents:[...u,{role:"user",parts:[{text:e}]}],config:{systemInstruction:l,responseMimeType:"application/json",temperature:n.temperature}})).text||"{}";t=t.replace(/```json/g,"").replace(/```/g,"").trim();try{return JSON.parse(t)}catch(s){console.warn("Standard JSON.parse failed, attempting cleanup...",s);let e=t.replace(/"([^"\\]|\\.)*"/g,e=>e.replace(/\n/g,"\\n").replace(/\r/g,"\\r").replace(/\t/g,"\\t"));try{return JSON.parse(e)}catch(s){throw console.error("CRITICAL: JSON parsing failed after cleanup."),console.error("RAW TEXT PRE-CLEANUP:",t),console.error("CLEANED TEXT:",e),s}}}catch(e){throw console.error("LLM Analysis Error:",e),Error("Failed to generate analysis code")}}async chat(e,t,s="chat"){let r=this.getClient();if(!r)return"AI service is not currently available. Please check your API key configuration.";let i=a[s],n=`
You are Mastiff, an expert AI Data Scientist and Financial Analyst.
You are helpful, precise, and deeply knowledgeable about data science, statistics, machine learning, and financial analysis.

${i.promptPrefix}

When the user hasn't uploaded any data yet, help them by:
1. Answering questions about data analysis, statistics, finance, and machine learning
2. Explaining concepts clearly with examples
3. Suggesting what data they could upload for analysis
4. Providing general assistance and guidance

When discussing financial topics:
- Be precise with numbers — use proper formatting ($1,234.56)
- Don't speculate without data — state assumptions clearly
- Suggest relevant analyses the user could run with their data
- Reference industry standards and best practices

Use markdown formatting in your responses: headings (##), bold (**text**), lists, code blocks (\`\`\`python), and tables where appropriate.
Be concise but thorough. Show expertise without being verbose.
`,o=t.slice(-i.maxHistorySlice).map(e=>({role:"assistant"===e.role?"model":"user",parts:[{text:e.content}]}));try{return(await r.models.generateContent({model:"gemini-2.5-flash",contents:[...o,{role:"user",parts:[{text:e}]}],config:{systemInstruction:n,temperature:i.temperature}})).text||"I wasn't able to generate a response. Please try again."}catch(e){return console.error("LLM Chat Error:",e),"I encountered an error while processing your request. Please try again."}}}let n=new i}};var t=require("../../../webpack-runtime.js");t.C(e);var s=e=>t(t.s=e),r=t.X(0,[638,452,889,511,139],()=>s(47627));module.exports=r})();