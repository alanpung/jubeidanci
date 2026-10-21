module.exports=[826424,a=>{"use strict";var b=a.i(137936),c=a.i(812259),d=a.i(129673),e=a.i(93321),f=a.i(618110),g=a.i(506152),h=a.i(118558),i=a.i(389637),j=a.i(841981);function k(a){(0,j.clearContentCache)(),setTimeout(()=>{try{(0,h.revalidatePath)("/library","layout"),(0,h.revalidatePath)("/units","layout")}catch(a){console.error("Background path revalidation failed:",a)}},0)}async function l(a,b){let h,j=await (0,f.k)(),l=(0,i.isAdminEmail)(j.user.email),[m]=await c.r.select({createdBy:d.unit.createdBy,visibility:d.unit.visibility}).from(d.unit).where((0,e.u)(d.unit.id,a));if(!m)return{success:!1,error:"Unit not found"};if(m.createdBy!==j.user.id&&!l)return{success:!1,error:"You do not own this unit"};if("public"===m.visibility&&!l)return{success:!1,error:"This unit is public and can no longer be edited. Only admins can make changes to public content."};let n=b.replace(/^```(?:markdown|md)?\n/m,"").replace(/\n```\s*$/,"").trim();try{h=(0,g.f)(n)}catch(a){return{success:!1,error:`Failed to parse markdown: ${a instanceof Error?a.message:String(a)}`}}return 0===h.lessons.length?{success:!1,error:"No lessons found. Make sure your markdown contains at least one lesson block with --- delimiters."}:(await c.r.update(d.unit).set({title:h.title,description:h.description,icon:h.icon,color:h.color,markdown:n,targetLanguage:h.targetLanguage??"de",sourceLanguage:h.sourceLanguage,level:h.level,updatedAt:new Date}).where((0,e.u)(d.unit.id,a)),k(),{success:!0,title:h.title,lessonCount:h.lessons.length,exerciseCount:h.lessons.reduce((a,b)=>a+b.exercises.length,0)})}async function m(a){let b=await (0,f.k)(),g=(0,i.isAdminEmail)(b.user.email),[h]=await c.r.select({createdBy:d.unit.createdBy,courseId:d.unit.courseId}).from(d.unit).where((0,e.u)(d.unit.id,a));return h?h.createdBy===b.user.id||g?(await c.r.delete(d.userUnitLibrary).where((0,e.u)(d.userUnitLibrary.unitId,a)),await c.r.delete(d.unit).where((0,e.u)(d.unit.id,a)),k(h.courseId),{success:!0}):{success:!1,error:"You do not own this unit"}:{success:!1,error:"Unit not found"}}async function n(a){let b=await (0,f.k)(),g=(0,i.isAdminEmail)(b.user.email),[h]=await c.r.select({createdBy:d.unit.createdBy,visibility:d.unit.visibility,courseId:d.unit.courseId}).from(d.unit).where((0,e.u)(d.unit.id,a));return h?h.createdBy===b.user.id||g?"public"===h.visibility?{success:!1,error:"Unit is already public"}:(await c.r.update(d.unit).set({visibility:"public",updatedAt:new Date}).where((0,e.u)(d.unit.id,a)),k(h.courseId),{success:!0}):{success:!1,error:"You do not own this unit"}:{success:!1,error:"Unit not found"}}async function o(a){let b=await (0,f.k)(),g=(0,i.isAdminEmail)(b.user.email),[h]=await c.r.select({createdBy:d.unit.createdBy,visibility:d.unit.visibility,courseId:d.unit.courseId}).from(d.unit).where((0,e.u)(d.unit.id,a));return h?h.createdBy===b.user.id||g?"public"!==h.visibility?{success:!1,error:"Unit is already private"}:(await c.r.update(d.unit).set({visibility:null,updatedAt:new Date}).where((0,e.u)(d.unit.id,a)),k(h.courseId),{success:!0}):{success:!1,error:"Only the author or admin can make units private"}:{success:!1,error:"Unit not found"}}async function p(a){let b=await (0,f.k)(),g=(0,i.isAdminEmail)(b.user.email),[h]=await c.r.select({createdBy:d.course.createdBy,visibility:d.course.visibility}).from(d.course).where((0,e.u)(d.course.id,a));return h?h.createdBy===b.user.id||g?"public"===h.visibility?{success:!1,error:"Course is already public"}:(await c.r.update(d.course).set({visibility:"public",updatedAt:new Date}).where((0,e.u)(d.course.id,a)),k(a),{success:!0}):{success:!1,error:"You do not own this course"}:{success:!1,error:"Course not found"}}async function q(a){let b=await (0,f.k)(),g=(0,i.isAdminEmail)(b.user.email),[h]=await c.r.select({createdBy:d.course.createdBy,visibility:d.course.visibility}).from(d.course).where((0,e.u)(d.course.id,a));return h?h.createdBy===b.user.id||g?"public"!==h.visibility?{success:!1,error:"Course is already private"}:(await c.r.update(d.course).set({visibility:null,updatedAt:new Date}).where((0,e.u)(d.course.id,a)),k(a),{success:!0}):{success:!1,error:"You do not own this course"}:{success:!1,error:"Course not found"}}async function r(a){let b=await (0,f.k)();if(!a.title.trim())return{success:!1,error:"Title is required"};if(!a.sourceLanguage)return{success:!1,error:"Source language is required"};if(!a.targetLanguage)return{success:!1,error:"Target language is required"};if(!a.level)return{success:!1,error:"Level is required"};let e=`${a.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40)}-${crypto.randomUUID().slice(0,8)}`;return await c.r.insert(d.course).values({id:e,title:a.title.trim(),sourceLanguage:a.sourceLanguage,targetLanguage:a.targetLanguage,level:a.level,visibility:null,published:!0,createdBy:b.user.id,createdAt:new Date,updatedAt:new Date}),k(),{success:!0,courseId:e}}async function s(a){let b=await (0,f.k)(),g=(0,i.isAdminEmail)(b.user.email),[h]=await c.r.select({createdBy:d.course.createdBy,visibility:d.course.visibility}).from(d.course).where((0,e.u)(d.course.id,a));return h?h.createdBy===b.user.id||g?(await c.r.update(d.unit).set({courseId:null,updatedAt:new Date}).where((0,e.u)(d.unit.courseId,a)),await c.r.delete(d.course).where((0,e.u)(d.course.id,a)),k(),{success:!0}):{success:!1,error:"You do not own this course"}:{success:!1,error:"Course not found"}}async function t(a,b){let g=await (0,f.k)(),h=(0,i.isAdminEmail)(g.user.email),[j]=await c.r.select({createdBy:d.course.createdBy,visibility:d.course.visibility}).from(d.course).where((0,e.u)(d.course.id,b));if(!j)return{success:!1,error:"Course not found"};if(j.createdBy!==g.user.id&&!h)return{success:!1,error:"You do not own this course"};let[l]=await c.r.select({createdBy:d.unit.createdBy,courseId:d.unit.courseId}).from(d.unit).where((0,e.u)(d.unit.id,a));return l?l.createdBy===g.user.id||h?l.courseId?{success:!1,error:"Unit is already assigned to a course. Remove it first."}:(await c.r.update(d.unit).set({courseId:b,updatedAt:new Date}).where((0,e.u)(d.unit.id,a)),k(b),{success:!0}):{success:!1,error:"You do not own this unit"}:{success:!1,error:"Unit not found"}}async function u(a){let b=await (0,f.k)(),g=(0,i.isAdminEmail)(b.user.email),[h]=await c.r.select({courseId:d.unit.courseId}).from(d.unit).where((0,e.u)(d.unit.id,a));if(!h)return{success:!1,error:"Unit not found"};if(!h.courseId)return{success:!1,error:"Unit is not in a course"};let[j]=await c.r.select({id:d.course.id,createdBy:d.course.createdBy,visibility:d.course.visibility}).from(d.course).where((0,e.u)(d.course.id,h.courseId));return j?j.createdBy===b.user.id||g?(await c.r.update(d.unit).set({courseId:null,updatedAt:new Date}).where((0,e.u)(d.unit.id,a)),k(j.id),{success:!0}):{success:!1,error:"You do not own this course"}:{success:!1,error:"Course not found"}}async function v(a){let b=await (0,f.k)(),c=await (0,j.getCourseForManagement)(a,b.user.id,(0,i.isAdminEmail)(b.user.email));return c?{success:!0,course:c,availableUnits:await (0,j.getUserOwnedStandaloneUnits)(b.user.id)}:{success:!1,error:"Course not found or access denied"}}async function w(a,b){let g=await (0,f.k)(),h=(0,i.isAdminEmail)(g.user.email),j=b.trim();if(!j)return{success:!1,error:"Title cannot be empty"};let[l]=await c.r.select({createdBy:d.course.createdBy,visibility:d.course.visibility}).from(d.course).where((0,e.u)(d.course.id,a));return l?l.createdBy===g.user.id||h?"public"!==l.visibility||h?(await c.r.update(d.course).set({title:j,updatedAt:new Date}).where((0,e.u)(d.course.id,a)),k(a),{success:!0}):{success:!1,error:"This course is public and can no longer be modified. Only admins can make changes to public content."}:{success:!1,error:"You do not own this course"}:{success:!1,error:"Course not found"}}async function x(a){let b=await (0,f.k)();if(!(0,i.isAdminEmail)(b.user.email))return{success:!1,error:"Only the site owner can create units"};if(!a.title?.trim())return{success:!1,error:"Title is required"};if(!a.targetLanguage)return{success:!1,error:"Target language is required"};let e=crypto.randomUUID(),g=a.title.trim(),h=a.targetLanguage,j=a.sourceLanguage||"en",l=a.level||"A1",m=a.courseId||null,n=a.questionType||"multiple-choice",o="",p="📘";switch(n){case"fill-in-the-blank":p="✏️",o=`[fill-in-the-blank]
sentence: "Complete the ___ here."
blank: "word"
srsWords: "word"`;break;case"matching-pairs":p="🧩",o=`[matching-pairs]
- "Word 1" = "Translation 1"
- "Word 2" = "Translation 2"
- "Word 3" = "Translation 3"`;break;case"listening":p="🎧",o=`[listening]
text: "Sentence to listen and transcribe"
ttsLang: "${h}"
srsWords: "sample"`;break;case"word-bank":p="🧱",o=`[word-bank]
text: "Translate: 'Sentence here'"
words: "sample" "word" "here"
answer: "sample" "word" "here"
srsWords: "sample"`;break;case"speaking":p="🎙️",o=`[speaking]
sentence: "Sentence to practice speaking"
srsWords: "sample"`;break;case"flashcard-review":p="🎴",o=`[flashcard-review]
front: "Word or prompt"
meaning: "English meaning or definition"
translation: "中文翻译"
srsWords: "sample"`;break;case"translation":p="🌐",o=`[translation]
text: "Translate to target language:"
sentence: "Sentence to translate"
answer: "Translation here"
srsWords: "sample"`;break;case"mix":p="🔀",o=`[multiple-choice]
text: "Select the correct option"
choices:
  - "Option 1" (correct)
  - "Option 2"
  - "Option 3"
srsWords: "sample"

[fill-in-the-blank]
sentence: "Complete the ___ here."
blank: "word"
srsWords: "word"`;break;default:p="🎯",o=`[multiple-choice]
text: "Select the correct option"
choices:
  - "Option 1" (correct)
  - "Option 2"
  - "Option 3"
srsWords: "sample"`}let q=`---
unitTitle: "${g}"
description: "Practice exercises for ${g}"
icon: "${p}"
color: "#4CAF50"
targetLanguage: "${h}"
sourceLanguage: "${j}"
level: "${l}"
questionType: "${n}"
---

---
lessonTitle: "Lesson 1: Introduction"
description: "Practice exercises"
icon: "${p}"
color: "#FF9600"
---

${o}
`;return await c.r.insert(d.unit).values({id:e,courseId:m,title:g,description:`Practice exercises for ${g}`,icon:p,color:"#4CAF50",markdown:q,targetLanguage:h,sourceLanguage:j,level:l,visibility:null,createdBy:b.user.id}),k(m),{success:!0,unitId:e}}(0,a.i(713095).ensureServerEntryExports)([l,m,n,o,p,q,r,s,t,u,v,w,x]),(0,b.registerServerReference)(l,"605310056afb4510c27f165797803866f2d9ac40a9",null),(0,b.registerServerReference)(m,"40073c26988292fd8e699ea9d0777e3e3733a78f44",null),(0,b.registerServerReference)(n,"40dab51d556748ce5cea4051830b23e430bf41424b",null),(0,b.registerServerReference)(o,"40a81509428b23935e145342648869c7dc2e1de924",null),(0,b.registerServerReference)(p,"40f6a702cc39c4605e1efd2303fffed01df12be343",null),(0,b.registerServerReference)(q,"40993ddcf654d5344e871a5eacb41b619625bf6572",null),(0,b.registerServerReference)(r,"40b874980fcfff3c289b6963cb89b11bc96e3e8d8a",null),(0,b.registerServerReference)(s,"40258d9383ba35d486ad6508dc4f784be6ad11f792",null),(0,b.registerServerReference)(t,"607fb1057839bbc192959ce766359dae0c63848230",null),(0,b.registerServerReference)(u,"4013c6091ce704abc5c287efefd95510894e90a9d4",null),(0,b.registerServerReference)(v,"400cdac444787ebccee9cfcfa10443595ea9b992e6",null),(0,b.registerServerReference)(w,"6028cd183c6c0c082bec9904b856b1e81604401159",null),(0,b.registerServerReference)(x,"403d58f40f8f1ed062d6893ca4f00260bb614faa2f",null),a.s(["t",0,t,"u",0,r,"p",0,x,"C",0,s,"m",0,m,"g",0,v,"c",0,q,"y",0,p,"b",0,o,"I",0,n,"R",0,u,"A",0,w,"F",0,l])}];

//# sourceMappingURL=lib_actions_units_ts_0lq0ayxbr-qlo._.js.map