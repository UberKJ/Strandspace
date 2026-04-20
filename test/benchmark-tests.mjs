export async function registerBenchmarkTests(ctx = {}) {
  const {
    assert,
    check,
    withServer,
    postJson,
    createSubjectConstruct,
    __setOpenAiAssistMock
  } = ctx;

  if (!assert || !check || !withServer || !postJson || !createSubjectConstruct || !__setOpenAiAssistMock) {
    throw new Error("registerBenchmarkTests missing required harness helpers.");
  }

  await check("GET /api/model-lab/status exposes models and benchmark timeout metadata", async () => {
    await withServer(async (address) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/model-lab/status`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.defaultProvider, "openai");
      assert.equal(typeof payload.reason, "string");
      assert.ok(Number(payload.requestTimeoutMs ?? 0) > 0);
      assert.ok(Number(payload.benchmarkTimeoutMs ?? 0) > 0);
      assert.ok(Array.isArray(payload.providers));
      assert.ok(payload.providers.some((provider) => provider.provider === "openai"));
      assert.ok((payload.providers.find((provider) => provider.provider === "openai")?.models?.length ?? 0) >= 1);
    });
  });

  await check("POST /api/model-lab/compare uses the dedicated benchmark timeout budget", async () => {
    const originalTimeout = process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
    const originalBenchmarkTimeout = process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS;
    process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = "25";
    process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS = "250";
    __setOpenAiAssistMock(async ({ question, subjectLabel }) => {
      await new Promise((resolve) => setTimeout(resolve, 120));

      return {
        responseId: "resp_model_lab_timeout_override",
        model: "gpt-5.4-mini",
        usage: {
          input_tokens: 18,
          output_tokens: 40,
          total_tokens: 58
        },
        assist: {
          apiAction: "validate",
          constructLabel: `${subjectLabel} timeout override draft`,
          target: `Validated benchmark answer for ${question}`,
          objective: "Use a longer model-lab timeout budget than the general assist timeout",
          contextEntries: [
            { key: "mode", value: "benchmark-timeout-override" }
          ],
          steps: [
            "Run local recall first.",
            "Allow the benchmark request enough time to complete.",
            "Store the resulting timing report."
          ],
          notes: "Synthetic delayed response that should succeed under the longer model-lab timeout.",
          tags: ["benchmark", "timeout"],
          validationFocus: ["latency"],
          rationale: "Mocked delayed response verifies the benchmark-specific timeout budget.",
          shouldLearn: false
        }
      };
    });

    try {
      await withServer(async (address) => {
        const construct = await createSubjectConstruct(address.port, {
          subjectLabel: `Model Timeout Budget Subject ${Date.now()}`
        });

        const response = await postJson(`http://127.0.0.1:${address.port}/api/model-lab/compare`, {
          provider: "openai",
          model: "gpt-5.4-mini",
          subjectId: construct.subjectId,
          question: "What is my gallery interview key light setup with the softbox at 45 degrees?"
        });

        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.ok, true);
        assert.equal(payload.provider, "openai");
        assert.equal(payload.llm.model, "gpt-5.4-mini");
        assert.ok(Number(payload.llm.latencyMs ?? 0) >= 100);
        assert.match(String(payload.comparison?.summary ?? ""), /faster|prompt/i);
      });
    } finally {
      __setOpenAiAssistMock(null);
      if (originalTimeout === undefined) {
        delete process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
      } else {
        process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = originalTimeout;
      }
      if (originalBenchmarkTimeout === undefined) {
        delete process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS;
      } else {
        process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS = originalBenchmarkTimeout;
      }
    }
  });

  await check("GET /api/model-lab/reports returns stored benchmark history after a successful compare", async () => {
    __setOpenAiAssistMock(async ({ question, subjectLabel }) => {
      await new Promise((resolve) => setTimeout(resolve, 20));

      return {
        responseId: "resp_mock_model_lab_reports",
        model: "gpt-5.4-mini",
        usage: {
          input_tokens: 16,
          output_tokens: 48,
          total_tokens: 64
        },
        assist: {
          apiAction: "validate",
          constructLabel: `${subjectLabel} model lab report draft`,
          target: `Model lab report answer for ${question}`,
          objective: "Verify stored benchmark history through the model lab reports API",
          contextEntries: [
            { key: "mode", value: "model-lab-report" }
          ],
          steps: [
            "Run local recall first.",
            "Run the selected benchmark model.",
            "Persist the timing report for later inspection."
          ],
          notes: "Synthetic report response for API coverage.",
          tags: ["benchmark", "report"],
          validationFocus: ["history"],
          rationale: "Mocked report response keeps model-lab persistence deterministic in tests.",
          shouldLearn: false
        }
      };
    });

    try {
      await withServer(async (address) => {
        const initialReportsResponse = await fetch(`http://127.0.0.1:${address.port}/api/model-lab/reports`);
        assert.equal(initialReportsResponse.status, 200);
        const initialReportsPayload = await initialReportsResponse.json();
        const initialTotalRuns = Number(initialReportsPayload.reports?.totalRuns ?? 0);

        const construct = await createSubjectConstruct(address.port, {
          subjectLabel: `Model Lab Reports Subject ${Date.now()}`
        });
        const testLabel = `Reports API coverage ${Date.now()}`;

        const compareResponse = await postJson(`http://127.0.0.1:${address.port}/api/model-lab/compare`, {
          provider: "openai",
          model: "gpt-5.4-mini",
          subjectId: construct.subjectId,
          question: "What is my gallery interview key light setup with the softbox at 45 degrees?",
          testLabel
        });

        assert.equal(compareResponse.status, 200);
        const comparePayload = await compareResponse.json();
        assert.equal(comparePayload.ok, true);
        assert.equal(comparePayload.provider, "openai");
        assert.equal(comparePayload.llm.model, "gpt-5.4-mini");

        const reportsResponse = await fetch(`http://127.0.0.1:${address.port}/api/model-lab/reports?recent=5&summary=5`);
        assert.equal(reportsResponse.status, 200);
        const reportsPayload = await reportsResponse.json();
        assert.equal(reportsPayload.ok, true);
        assert.equal(Number(reportsPayload.reports?.totalRuns ?? 0), initialTotalRuns + 1);

        const matchingReport = reportsPayload.reports?.recent?.find((item) => item.testLabel === testLabel);
        assert.ok(matchingReport);
        assert.equal(matchingReport.provider, "openai");
        assert.equal(matchingReport.model, "gpt-5.4-mini");
        assert.equal(matchingReport.mode, "compare");
        assert.equal(matchingReport.question, "What is my gallery interview key light setup with the softbox at 45 degrees?");
        assert.equal(matchingReport.localConstructLabel, construct.constructLabel);
        assert.equal(typeof matchingReport.summary, "string");
        assert.ok(matchingReport.summary.length > 0);
        assert.ok(matchingReport.debug);

        assert.ok(Array.isArray(reportsPayload.reports?.summaryByModel));
        assert.ok(reportsPayload.reports.summaryByModel.some((entry) => entry.provider === "openai" && entry.model === "gpt-5.4-mini"));

        const statsResponse = await fetch(`http://127.0.0.1:${address.port}/api/stats`);
        assert.equal(statsResponse.status, 200);
        const statsPayload = await statsResponse.json();
        assert.equal(Number(statsPayload.counts?.benchmarkReportCount ?? 0), Number(reportsPayload.reports?.totalRuns ?? 0));
      });
    } finally {
      __setOpenAiAssistMock(null);
    }
  });

  await check("POST /api/model-lab/compare returns model testing unavailable on timeout and does not persist a report entry", async () => {
    const originalTimeout = process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
    const originalModelLabTimeout = process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS;
    const originalModelList = process.env.SUBJECTSPACE_OPENAI_MODELS;
    process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = "25";
    process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS = "25";
    process.env.SUBJECTSPACE_OPENAI_MODELS = "gpt-5.4-mini,gpt-5.4,gpt-5.2";
    __setOpenAiAssistMock(async () => await new Promise(() => {}));

    try {
      await withServer(async (address) => {
        const initialReportsResponse = await fetch(`http://127.0.0.1:${address.port}/api/model-lab/reports`);
        assert.equal(initialReportsResponse.status, 200);
        const initialReportsPayload = await initialReportsResponse.json();
        const initialTotalRuns = Number(initialReportsPayload.reports?.totalRuns ?? 0);
        const testLabel = `Timeout should not persist ${Date.now()}`;

        const construct = await createSubjectConstruct(address.port, {
          subjectLabel: `Model Timeout Subject ${Date.now()}`
        });

        const started = Date.now();
        const response = await postJson(`http://127.0.0.1:${address.port}/api/model-lab/compare`, {
          provider: "openai",
          model: "gpt-5.4-mini",
          subjectId: construct.subjectId,
          question: "What is my gallery interview tungsten setup?",
          testLabel
        });

        assert.equal(response.status, 503);
        const payload = await response.json();
        assert.equal(payload.ok, false);
        assert.equal(payload.code, "MODEL_TESTING_UNAVAILABLE");
        assert.match(String(payload.error), /model testing unavailable/i);
        assert.match(String(payload.detail), /try/i);
        assert.ok(Array.isArray(payload.suggestedModels));
        assert.ok(payload.suggestedModels.some((entry) => entry.provider === "openai" && entry.model === "gpt-5.4"));
        assert.ok(Date.now() - started < 1000);

        const reportsResponse = await fetch(`http://127.0.0.1:${address.port}/api/model-lab/reports?recent=10&summary=5`);
        assert.equal(reportsResponse.status, 200);
        const reportsPayload = await reportsResponse.json();
        assert.equal(Number(reportsPayload.reports?.totalRuns ?? 0), initialTotalRuns);
        assert.ok(!reportsPayload.reports?.recent?.some((item) => item.testLabel === testLabel));
      });
    } finally {
      __setOpenAiAssistMock(null);
      if (originalTimeout === undefined) {
        delete process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
      } else {
        process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = originalTimeout;
      }
      if (originalModelLabTimeout === undefined) {
        delete process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS;
      } else {
        process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS = originalModelLabTimeout;
      }
      if (originalModelList === undefined) {
        delete process.env.SUBJECTSPACE_OPENAI_MODELS;
      } else {
        process.env.SUBJECTSPACE_OPENAI_MODELS = originalModelList;
      }
    }
  });
}
