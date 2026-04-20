async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function getSystemHealth() {
  return fetchJson("/api/system/health");
}

export async function listSubjects() {
  return fetchJson("/api/subjectspace/subjects");
}

export async function listTopicConstructs(topic = "") {
  const params = new URLSearchParams();
  if (topic) params.set("topic", topic);
  const qs = params.toString();
  return fetchJson(qs ? `/api/topicspace/constructs?${qs}` : "/api/topicspace/constructs");
}

export async function getTopicConstruct(id = "") {
  const params = new URLSearchParams();
  params.set("id", String(id ?? "").trim());
  return fetchJson(`/api/topicspace/construct?${params.toString()}`);
}

export async function recallTopicspace({ question = "", topic = "" } = {}) {
  const params = new URLSearchParams();
  params.set("q", String(question ?? "").trim());
  if (String(topic ?? "").trim()) params.set("topic", String(topic).trim());
  return fetchJson(`/api/topicspace/recall?${params.toString()}`);
}

export async function answerTopicspace({ question = "", topic = "" } = {}) {
  const params = new URLSearchParams();
  params.set("q", String(question ?? "").trim());
  if (String(topic ?? "").trim()) params.set("topic", String(topic).trim());
  return fetchJson(`/api/topicspace/answer?${params.toString()}`);
}

export async function learnTopicConstruct(payload = {}) {
  return fetchJson("/api/topicspace/learn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function learnSubjectConstruct(payload = {}) {
  return fetchJson("/api/subjectspace/learn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

