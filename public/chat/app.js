let currentConversationId=null;
let currentMessages=[];
let currentConversationMeta=null;
let conversationsCache=[];
let systemStatus={text:'Loading...',type:'neutral'};
let requestStatus={text:'',type:'neutral'};

const statusBadge=document.getElementById('chat-status-badge');

function renderStatusBadge(){
  const active=requestStatus.text?requestStatus:systemStatus;
  statusBadge.textContent=active.text||'Ready';
  statusBadge.className=`status-badge status-${active.type||'neutral'}`;
}

function setStatus(text,type='neutral'){requestStatus={text,type};renderStatusBadge();}
function clearRequestStatus(){requestStatus={text:'',type:'neutral'};renderStatusBadge();}

function escapeHtml(text){const div=document.createElement('div');div.textContent=text;return div.innerHTML;}
function escapeAttribute(value){return String(value??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function showNewChatState(){
  currentConversationId=null;
  currentMessages=[];
  currentConversationMeta=null;
  document.getElementById('messages-container').innerHTML=`<div class="welcome-state"><h2>New Conversation</h2><p>Ask a question to get started.</p></div>`;
  document.getElementById('chat-title').textContent='New Conversation';
  document.getElementById('chat-subtitle').textContent='Ask a question to get started';
  document.getElementById('chat-form').style.display='flex';
  document.getElementById('delete-chat-btn').style.display='none';
  document.querySelectorAll('.conversation-item').forEach(btn=>btn.classList.remove('is-active'));
  const input=document.getElementById('message-input');
  if(input){input.value='';input.disabled=false;input.focus();}
}

async function loadSystemStatus(){
  try{
    const response=await fetch('/api/system/health');
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    systemStatus=data?.openai?.enabled
      ? {text:`OpenAI: ${data.openai.model||'enabled'}`,type:'success'}
      : {text:'Local only',type:'neutral'};
  }catch(error){
    console.error('Failed to load system status:',error);
    systemStatus={text:'Status unavailable',type:'error'};
  }
  renderStatusBadge();
}

async function loadSubjects(){
  try{
    const response=await fetch('/api/subjectspace/subjects');
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    const select=document.getElementById('subject-select');
    if(!select) return;
    const subjects=Array.isArray(data.subjects)?data.subjects:[];
    select.innerHTML=['<option value="">General Recall</option>',...subjects.map(subject=>{
      const id=String(subject.subjectId??'').trim();
      const label=String(subject.subjectLabel??id).trim()||id;
      return `<option value="${escapeAttribute(id)}">${escapeHtml(label)}</option>`;
    })].join('');
    if(data.defaultSubjectId) select.value=String(data.defaultSubjectId);
  }catch(error){
    console.error('Failed to load subjects:',error);
  }
}

async function loadConversations(){
  try{
    const response=await fetch('/api/chat/conversations?limit=50');
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    conversationsCache=Array.isArray(data.conversations)?data.conversations:[];
    renderConversationsList(conversationsCache);
    clearRequestStatus();
    return conversationsCache;
  }catch(error){
    console.error('Failed to load conversations:',error);
    setStatus('Error loading conversations','error');
    document.getElementById('conversations-list').innerHTML='<p class="placeholder">Failed to load conversations</p>';
    return [];
  }
}

function findConversationMeta(conversationId){return conversationId?conversationsCache.find(entry=>entry.id===conversationId)||null:null;}

function renderConversationsList(conversations){
  const list=document.getElementById('conversations-list');
  if(!conversations||conversations.length===0){list.innerHTML='<p class="placeholder">No conversations yet</p>';return;}
  list.innerHTML=conversations.map(conv=>`
    <button class="conversation-item ${currentConversationId===conv.id?'is-active':''}" data-conversation-id="${escapeAttribute(conv.id)}">
      <div class="conv-title">${escapeHtml(conv.title||'Untitled')}</div>
      <div class="conv-meta">
        <span class="conv-count">${Number(conv.messageCount??0)} messages</span>
        <time class="conv-date">${formatDate(conv.lastMessageAt)}</time>
      </div>
    </button>`).join('');
  document.querySelectorAll('.conversation-item').forEach(btn=>btn.addEventListener('click',()=>loadConversation(btn.dataset.conversationId)));
}

async function loadConversation(conversationId){
  try{
    setStatus('Loading conversation...','neutral');
    const response=await fetch(`/api/chat/history/${conversationId}`);
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    currentConversationId=conversationId;
    currentMessages=data.messages||[];
    currentConversationMeta={...(findConversationMeta(conversationId)||{}),...(data.conversation||{}),id:conversationId};
    const subjectSelect=document.getElementById('subject-select');
    if(subjectSelect) subjectSelect.value=currentConversationMeta?.subjectId||'';
    updateConversationUI();
    renderMessages();
    clearRequestStatus();
  }catch(error){
    console.error('Failed to load conversation:',error);
    setStatus('Error loading conversation','error');
  }
}

function updateConversationUI(){
  const conversationTitle=String(currentConversationMeta?.title??'').trim();
  const subjectId=String(currentConversationMeta?.subjectId??currentMessages[0]?.subjectId??'').trim();
  document.getElementById('chat-title').textContent=conversationTitle||(currentConversationId?`Conversation ${currentConversationId.substring(0,12)}...`:'Chat');
  document.getElementById('chat-subtitle').textContent=subjectId?`${currentMessages.length} messages in ${subjectId}`:`${currentMessages.length} messages`;
  document.getElementById('chat-form').style.display='flex';
  document.getElementById('delete-chat-btn').style.display='block';
  document.getElementById('messages-container').className='messages-container';
  document.querySelectorAll('.conversation-item').forEach(btn=>btn.classList.toggle('is-active',btn.dataset.conversationId===currentConversationId));
}

function renderMessages(){
  const container=document.getElementById('messages-container');
  if(!currentMessages||currentMessages.length===0){container.innerHTML='<p class="placeholder">No messages yet</p>';return;}
  container.innerHTML=currentMessages.map(msg=>`
    <div class="message message-${escapeAttribute(msg.role)} ${msg.isPending?'is-pending':''}">
      <div class="message-role">${msg.role==='user'?'You':'Assistant'}</div>
      <div class="message-content">${escapeHtml(msg.content)}</div>
      <time class="message-time">${formatTime(msg.createdAt)}</time>
    </div>`).join('');
  setTimeout(()=>{container.scrollTop=container.scrollHeight;},0);
}

function removePendingAssistantMessage(){currentMessages=currentMessages.filter(msg=>!msg.isPending);}

async function sendMessage(content){
  if(!content.trim()) return;
  const input=document.getElementById('message-input');
  const submitButton=document.querySelector('.send-btn');
  const subjectSelect=document.getElementById('subject-select');
  const selectedSubjectId=subjectSelect?subjectSelect.value:'';
  try{
    setStatus('Sending...','neutral');
    if(input) input.disabled=true;
    if(submitButton){submitButton.disabled=true;submitButton.textContent='Sending...';}
    currentMessages.push({role:'user',content,createdAt:new Date().toISOString()});
    currentMessages.push({role:'assistant',content:'Thinking...',createdAt:new Date().toISOString(),isPending:true});
    renderMessages();
    const response=await fetch('/api/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:content,conversationId:currentConversationId,subjectId:selectedSubjectId})
    });
    const data=await response.json();
    if(!response.ok) throw new Error(data?.error||`HTTP ${response.status}`);
    removePendingAssistantMessage();
    if(!currentConversationId) currentConversationId=data.conversationId;
    currentMessages.push({role:'assistant',content:data.answer||'No response returned.',createdAt:new Date().toISOString()});
    renderMessages();
    currentConversationMeta=findConversationMeta(currentConversationId)||currentConversationMeta;
    await loadConversations();
    currentConversationMeta=findConversationMeta(currentConversationId)||currentConversationMeta;
    if(currentConversationId) await loadConversation(currentConversationId);
    clearRequestStatus();
  }catch(error){
    console.error('Failed to send message:',error);
    removePendingAssistantMessage();
    renderMessages();
    setStatus(error instanceof Error?error.message:'Error sending message','error');
    if(input){input.value=content;input.focus();}
  }finally{
    if(input) input.disabled=false;
    if(submitButton){submitButton.disabled=false;submitButton.textContent='Send';}
  }
}

async function deleteConversation(conversationId){
  if(!confirm('Delete this conversation?')) return;
  try{
    setStatus('Deleting...','neutral');
    const response=await fetch(`/api/chat/delete/${conversationId}`,{method:'POST'});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    showNewChatState();
    await loadConversations();
    clearRequestStatus();
  }catch(error){
    console.error('Failed to delete conversation:',error);
    setStatus('Error deleting conversation','error');
  }
}

function formatDate(isoString){
  const date=new Date(isoString);
  if(Number.isNaN(date.getTime())) return '';
  const today=new Date();
  const yesterday=new Date(today);
  yesterday.setDate(yesterday.getDate()-1);
  if(date.toDateString()===today.toDateString()) return date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  if(date.toDateString()===yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month:'short', day:'numeric' });
}

function formatTime(isoString){
  const date=new Date(isoString);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

document.getElementById('new-chat-btn').addEventListener('click',()=>{showNewChatState();clearRequestStatus();});
document.getElementById('chat-form').addEventListener('submit',async e=>{e.preventDefault();const input=document.getElementById('message-input');const content=input.value;input.value='';await sendMessage(content);});
document.getElementById('delete-chat-btn').addEventListener('click',()=>{if(currentConversationId) deleteConversation(currentConversationId);});
document.getElementById('theme-toggle').addEventListener('click',()=>{document.body.classList.toggle('dark-mode');localStorage.setItem('theme',document.body.classList.contains('dark-mode')?'dark':'light');});

window.addEventListener('DOMContentLoaded',async()=>{
  const savedTheme=localStorage.getItem('theme');
  if(savedTheme==='dark') document.body.classList.add('dark-mode');
  await loadSystemStatus();
  await loadSubjects();
  await loadConversations();
  showNewChatState();
  clearRequestStatus();
});
