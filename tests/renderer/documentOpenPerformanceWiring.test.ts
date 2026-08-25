import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("document open performance instrumentation wiring (#140 / #152)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");
  const editorSurfaceSource = readFileSync(
    "src/renderer/EditorSurface.tsx",
    "utf8"
  );
  const glossaryPreviewDecoratorSource = readFileSync(
    "src/renderer/GlossaryPreviewDecorator.tsx",
    "utf8"
  );

  function functionBody(source: string, startMarker: string): string {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(
      "function replaceSavedDocument(",
      start === -1 ? 0 : start
    );

    expect(start).toBeGreaterThan(-1);

    return source.slice(start, end);
  }

  describe("shared instrumentation boundary: completeInstrumentedDocumentOpen", () => {
    it("logs document.open.editorDocument.applied and sets documentOpenMeasurement only after the open operation resolves", () => {
      const body = functionBody(
        appSource,
        "async function completeInstrumentedDocumentOpen("
      );
      const performOpenIndex = body.indexOf("const opened = await performOpen();");
      const appliedIndex = body.indexOf(
        'event: "document.open.editorDocument.applied"'
      );
      const measurementIndex = body.indexOf(
        "setDocumentOpenMeasurement({ documentOpenId, startedAt: openStartedAt });"
      );

      expect(performOpenIndex).toBeGreaterThan(-1);
      expect(appliedIndex).toBeGreaterThan(performOpenIndex);
      expect(measurementIndex).toBeGreaterThan(appliedIndex);
    });

    it("measures editorDocument.applied.durationMs from a mark taken immediately before performOpen(), not from openStartedAt (code-review fix: must exclude OS file-chooser time)", () => {
      const body = functionBody(
        appSource,
        "async function completeInstrumentedDocumentOpen("
      );
      const applyMarkIndex = body.indexOf(
        "const applyStartedAt = performance.now();"
      );
      const performOpenIndex = body.indexOf("const opened = await performOpen();");
      const appliedIndex = body.indexOf(
        'event: "document.open.editorDocument.applied"'
      );
      const appliedBlockEnd = body.indexOf("});", appliedIndex);
      const appliedBlock = body.slice(appliedIndex, appliedBlockEnd);

      expect(applyMarkIndex).toBeGreaterThan(-1);
      expect(applyMarkIndex).toBeLessThan(performOpenIndex);
      expect(appliedBlock).toContain(
        "durationMs: durationSincePerformanceMark(applyStartedAt)"
      );
      expect(appliedBlock).not.toContain(
        "durationMs: durationSincePerformanceMark(openStartedAt)"
      );
    });

    it("does not log editorDocument.applied and does not set documentOpenMeasurement when performOpen() resolves to false, but still closes out document.open.completed honestly", () => {
      const body = functionBody(
        appSource,
        "async function completeInstrumentedDocumentOpen("
      );
      const performOpenIndex = body.indexOf("const opened = await performOpen();");
      const notOpenedIndex = body.indexOf("if (!opened) {");
      const returnFalseIndex = body.indexOf("return false;", notOpenedIndex);
      const notOpenedBlockEnd = returnFalseIndex + "return false;".length;
      const notOpenedBlock = body.slice(notOpenedIndex, notOpenedBlockEnd);
      const appliedIndex = body.indexOf(
        'event: "document.open.editorDocument.applied"'
      );
      const setMeasurementIndex = body.indexOf(
        "setDocumentOpenMeasurement({ documentOpenId, startedAt: openStartedAt });"
      );

      expect(performOpenIndex).toBeGreaterThan(-1);
      expect(notOpenedIndex).toBeGreaterThan(performOpenIndex);
      expect(notOpenedBlock).toContain('event: "document.open.completed"');
      expect(notOpenedBlock).toContain('result: "ignored"');
      expect(notOpenedBlock).toContain("return false;");
      expect(notOpenedBlock).not.toContain(
        'event: "document.open.editorDocument.applied"'
      );
      // The applied log and measurement handoff must only appear after the
      // !opened short-circuit's own return, on the success path.
      expect(appliedIndex).toBeGreaterThan(notOpenedBlockEnd);
      expect(setMeasurementIndex).toBeGreaterThan(notOpenedBlockEnd);
    });

    it("logs document.open.failed at error level with documentOpenId when the open operation throws, then rethrows", () => {
      const body = functionBody(
        appSource,
        "async function completeInstrumentedDocumentOpen("
      );
      const catchIndex = body.indexOf("} catch (error) {");
      const catchBody = body.slice(catchIndex);

      expect(catchBody).toContain('event: "document.open.failed"');
      expect(catchBody).toContain('level: "error"');
      expect(catchBody).toContain("documentOpenId,");
      expect(catchBody).toContain('result: "failed"');
      expect(catchBody).toContain("throw error;");
      expect(catchBody).not.toContain("file.content");
    });

    it("is the single place document.open.editorDocument.applied / document.open.failed are logged (not duplicated per caller)", () => {
      const appliedCount = (
        appSource.match(/event: "document\.open\.editorDocument\.applied"/g) ??
        []
      ).length;
      const failedLogCount = (
        appSource.match(/event: "document\.open\.failed"/g) ?? []
      ).length;

      expect(appliedCount).toBe(1);
      expect(failedLogCount).toBe(1);
    });
  });

  describe("File menu open path (openFile)", () => {
    it("generates a fresh documentOpenId and logs document.open.started (documentKind: file) before the file-open IPC call", () => {
      const body = functionBody(appSource, "async function openFile(");

      expect(body).toContain("const documentOpenId = nextDocumentOpenId();");

      const startedIndex = body.indexOf('event: "document.open.started"');
      const startedBlockEnd = body.indexOf("});", startedIndex);
      const startedBlock = body.slice(startedIndex, startedBlockEnd);
      const ipcCallIndex = body.indexOf(
        "window.pergamum.files.openMarkdown(documentOpenId)"
      );

      expect(startedIndex).toBeGreaterThan(-1);
      expect(startedBlock).toContain('documentKind: "file"');
      expect(startedBlock).toContain('editorKind: "markdown"');
      expect(ipcCallIndex).toBeGreaterThan(startedIndex);
    });

    it("passes documentOpenId to the openMarkdown IPC call so main-process file-read timing can be correlated", () => {
      expect(appSource).toContain(
        "window.pergamum.files.openMarkdown(documentOpenId)"
      );
    });

    it("does not re-log document.open.failed for an IPC read failure — the main process already logs it (see fileIpc.ts)", () => {
      const body = functionBody(appSource, "async function openFile(");
      const ipcTryIndex = body.indexOf(
        "file = await window.pergamum.files.openMarkdown(documentOpenId);"
      );
      const ipcCatchStart = body.indexOf("} catch (error) {", ipcTryIndex);
      const ipcCatchEnd = body.indexOf("}", ipcCatchStart + 20);
      const ipcCatchBody = body.slice(ipcCatchStart, ipcCatchEnd);

      expect(ipcCatchBody).not.toContain("document.open.failed");
      expect(ipcCatchBody).toContain("status.documentOpenFailed");
    });

    it("logs document.open.completed with result: cancelled when the user cancels the file dialog, not a fabricated failure", () => {
      const body = functionBody(appSource, "async function openFile(");
      const cancelBranchStart = body.indexOf("if (!file) {");
      const cancelBranchEnd = body.indexOf("const openedDocument =");
      const cancelBranch = body.slice(cancelBranchStart, cancelBranchEnd);

      expect(cancelBranch).toContain('event: "document.open.completed"');
      expect(cancelBranch).toContain('result: "cancelled"');
    });

    it("completes the open through the shared completeInstrumentedDocumentOpen wrapper, passing openDocument as the operation", () => {
      const body = functionBody(appSource, "async function openFile(");

      expect(body).toContain(
        "await completeInstrumentedDocumentOpen(documentOpenId, startedAt, () =>"
      );
      expect(body).toMatch(/\(\) =>\s*openDocument\(openedDocument\)/);
    });
  });

  describe("Workspace/File Explorer open path (activateProjectDocument) — #152 follow-up", () => {
    it("does not generate a documentOpenId or log anything for a relativePath that isn't a real project document", () => {
      const body = functionBody(
        appSource,
        "async function activateProjectDocument("
      );
      const notFoundGuardIndex = body.indexOf("if (!document) {");
      const notFoundGuardEnd = body.indexOf("return;", notFoundGuardIndex);
      const idGenerationIndex = body.indexOf(
        "const documentOpenId = nextDocumentOpenId();"
      );

      expect(notFoundGuardIndex).toBeGreaterThan(-1);
      expect(idGenerationIndex).toBeGreaterThan(notFoundGuardEnd);
    });

    it("generates a fresh documentOpenId and logs document.open.started (documentKind: project) with no OS dialog step beforehand", () => {
      const body = functionBody(
        appSource,
        "async function activateProjectDocument("
      );

      expect(body).toContain("const documentOpenId = nextDocumentOpenId();");
      expect(body).toContain("const startedAt = performance.now();");

      const startedIndex = body.indexOf('event: "document.open.started"');
      const startedBlockEnd = body.indexOf("});", startedIndex);
      const startedBlock = body.slice(startedIndex, startedBlockEnd);

      expect(startedIndex).toBeGreaterThan(-1);
      expect(startedBlock).toContain('documentKind: "project"');
      expect(startedBlock).toContain('editorKind: "markdown"');
    });

    it("completes the open through the same shared completeInstrumentedDocumentOpen wrapper as the File menu path", () => {
      const body = functionBody(
        appSource,
        "async function activateProjectDocument("
      );

      expect(body).toContain(
        "const didOpen = await completeInstrumentedDocumentOpen("
      );
      expect(body).toContain(
        "() => openEditorFromExplicitActivation(documentId)"
      );
    });

    it("does not fabricate a document.open.fileRead.completed event for this path (no fs.readFile boundary is threaded through here)", () => {
      const body = functionBody(
        appSource,
        "async function activateProjectDocument("
      );

      expect(body).not.toContain("document.open.fileRead.completed");
    });

    it("does not log the relative path, document content, or any raw file identity in its document.open.started call", () => {
      const body = functionBody(
        appSource,
        "async function activateProjectDocument("
      );
      const startedIndex = body.indexOf('event: "document.open.started"');
      const startedBlockEnd = body.indexOf("});", startedIndex);
      const startedBlock = body.slice(startedIndex, startedBlockEnd);

      expect(startedBlock).not.toContain("relativePath");
      expect(startedBlock).not.toContain("document.content");
      expect(startedBlock).not.toContain("document.name");
    });

    it("documents, in a code comment, why this path's editorDocument.applied duration differs in meaning from the File menu path's", () => {
      const start = appSource.indexOf(
        "async function completeInstrumentedDocumentOpen("
      );
      const commentBlock = appSource.slice(
        appSource.lastIndexOf("/**", start),
        start
      );

      expect(commentBlock).toContain("Explorer");
      expect(commentBlock.toLowerCase()).toContain("resolve/read");
    });
  });

  describe("handleDocumentOpenMeasured (shared by both open paths)", () => {
    it("ignores a callback that does not match the in-flight documentOpenId", () => {
      const body = functionBody(
        appSource,
        "function handleDocumentOpenMeasured("
      );

      expect(body).toContain(
        "documentOpenMeasurement.documentOpenId !== documentOpenId"
      );
    });

    it("logs previewRender.completed, usable, and completed in that order, then clears the measurement", () => {
      const body = functionBody(
        appSource,
        "function handleDocumentOpenMeasured("
      );

      const previewIndex = body.indexOf(
        'event: "document.open.previewRender.completed"'
      );
      const usableIndex = body.indexOf('event: "document.open.usable"');
      const completedIndex = body.indexOf('event: "document.open.completed"');
      const clearIndex = body.indexOf("setDocumentOpenMeasurement(null);");

      expect(previewIndex).toBeGreaterThan(-1);
      expect(usableIndex).toBeGreaterThan(previewIndex);
      expect(completedIndex).toBeGreaterThan(usableIndex);
      expect(clearIndex).toBeGreaterThan(completedIndex);
      expect(body).toContain('result: "succeeded"');
    });

    it("computes usable/completed duration from the total operation start (documentOpenMeasurement.startedAt), not from the preview-render measurement alone — both paths' total timing stays honest", () => {
      const body = functionBody(
        appSource,
        "function handleDocumentOpenMeasured("
      );

      expect(body).toContain(
        "const usableDurationMs = durationSincePerformanceMark("
      );
      expect(body).toContain("documentOpenMeasurement.startedAt");
    });
  });

  describe("EditorSurface / MarkdownEditorSurface plumbing (path-agnostic)", () => {
    it("passes documentOpenId and the measured-preview callback down to EditorSurface", () => {
      const componentIndex = appSource.indexOf("<EditorSurface");
      const closeIndex = appSource.indexOf("/>", componentIndex);
      const propsBlock = appSource.slice(componentIndex, closeIndex);

      expect(propsBlock).toContain(
        "documentOpenId={documentOpenMeasurement?.documentOpenId ?? null}"
      );
      expect(propsBlock).toContain(
        "onDocumentOpenPreviewRendered={handleDocumentOpenMeasured}"
      );
    });

    it("EditorSurface threads documentOpenId only to MarkdownEditorSurface (line-mode editors are out of scope for #152)", () => {
      const markdownCaseStart = editorSurfaceSource.indexOf('case "markdown":');
      const markdownCaseEnd = editorSurfaceSource.indexOf(
        'case "glossaryEntry":'
      );
      const markdownCase = editorSurfaceSource.slice(
        markdownCaseStart,
        markdownCaseEnd
      );

      expect(markdownCase).toContain("documentOpenId={documentOpenId}");
      expect(markdownCase).toContain(
        "onDocumentOpenPreviewRendered={onDocumentOpenPreviewRendered}"
      );
    });

    it("measures preview render duration around markdownPreviewRenderer.render (inside the memoized useMemoizedPreviewRender hook, #250 follow-up) without logging inside the render body", () => {
      expect(editorSurfaceSource).toContain(
        "const startedAt = performance.now();"
      );
      expect(editorSurfaceSource).toContain(
        "const html = markdownPreviewRenderer.render(previewSourceContent);"
      );
      expect(editorSurfaceSource).toContain(
        "durationMs: performance.now() - startedAt"
      );
      expect(editorSurfaceSource).toContain(
        "const previewRender = useMemoizedPreviewRender(previewSourceContent);"
      );
      expect(editorSurfaceSource).toContain(
        "const previewHtml = previewRender.html;"
      );
      expect(editorSurfaceSource).toContain(
        "const previewRenderStartedAt = previewRender.startedAt;"
      );
      expect(editorSurfaceSource).toContain(
        "const previewRenderDurationMs = previewRender.durationMs;"
      );
      // No logRendererDebugEvent import/usage here — logging stays centralized
      // in App.tsx; this component only measures and reports via callback.
      expect(editorSurfaceSource).not.toContain("logRendererDebugEvent");
    });

    it("markdown-it only re-runs when previewSourceContent changes (#250 follow-up: production, not just the test harness, is memoized)", () => {
      const hookStart = editorSurfaceSource.indexOf(
        "export function useMemoizedPreviewRender("
      );
      const hookEnd = editorSurfaceSource.indexOf(
        "interface EditorSurfaceProps",
        hookStart
      );

      expect(hookStart).toBeGreaterThan(-1);
      expect(hookEnd).toBeGreaterThan(hookStart);

      const hookBody = editorSurfaceSource.slice(hookStart, hookEnd);

      expect(hookBody).toContain("useMemo(() => {");
      expect(hookBody).toContain("}, [previewSourceContent]);");
    });

    it("fires the one-shot measurement effect only when documentOpenId changes, not on every content edit — works the same regardless of which open path set it", () => {
      const effectStart = editorSurfaceSource.indexOf(
        "useEffect(() => {\n    if (documentOpenId"
      );
      const effectEnd = editorSurfaceSource.indexOf("}, [documentOpenId]);");

      expect(effectStart).toBeGreaterThan(-1);
      expect(effectEnd).toBeGreaterThan(effectStart);

      const effectBody = editorSurfaceSource.slice(effectStart, effectEnd);

      expect(effectBody).toContain(
        "onDocumentOpenPreviewRendered(documentOpenId, previewRenderDurationMs, {"
      );
    });

    it("guards the one-shot measurement effect against React StrictMode's double-invocation with a ref keyed on the reported documentOpenId (main.tsx renders under <React.StrictMode>)", () => {
      expect(editorSurfaceSource).toContain(
        "const reportedDocumentOpenIdRef = useRef<string | null>(null);"
      );

      const effectStart = editorSurfaceSource.indexOf(
        "useEffect(() => {\n    if (documentOpenId"
      );
      const effectEnd = editorSurfaceSource.indexOf("}, [documentOpenId]);");
      const effectBody = editorSurfaceSource.slice(effectStart, effectEnd);

      expect(effectBody).toContain(
        "reportedDocumentOpenIdRef.current !== documentOpenId"
      );
      expect(effectBody).toContain(
        "reportedDocumentOpenIdRef.current = documentOpenId;"
      );
    });
  });

  describe("documentOpenId sharing across open paths", () => {
    it("both open paths call the same nextDocumentOpenId() factory (one centralized generator)", () => {
      const occurrences = (
        appSource.match(/const documentOpenId = nextDocumentOpenId\(\);/g) ??
        []
      ).length;

      expect(occurrences).toBe(2);
    });
  });

  describe("preview DOM commit / decoration timing wiring (#154)", () => {
    it("threads onDocumentOpenPreviewDomCommitted / onDocumentOpenPreviewDecorationCompleted from App.tsx through EditorSurface to MarkdownEditorSurface", () => {
      const componentIndex = appSource.indexOf("<EditorSurface");
      const closeIndex = appSource.indexOf("/>", componentIndex);
      const propsBlock = appSource.slice(componentIndex, closeIndex);

      expect(propsBlock).toContain(
        "onDocumentOpenPreviewDomCommitted={\n                      handleDocumentOpenPreviewDomCommitted\n                    }"
      );
      expect(propsBlock).toContain(
        "onDocumentOpenPreviewDecorationCompleted={\n                      handleDocumentOpenPreviewDecorationCompleted\n                    }"
      );

      const markdownCaseStart = editorSurfaceSource.indexOf('case "markdown":');
      const markdownCaseEnd = editorSurfaceSource.indexOf(
        'case "glossaryEntry":'
      );
      const markdownCase = editorSurfaceSource.slice(
        markdownCaseStart,
        markdownCaseEnd
      );

      expect(markdownCase).toContain(
        "onDocumentOpenPreviewDomCommitted={onDocumentOpenPreviewDomCommitted}"
      );
      expect(markdownCase).toContain(
        "onDocumentOpenPreviewDecorationCompleted"
      );
    });

    it("MarkdownEditorSurface passes documentOpenId and previewRenderStartedAt down to GlossaryPreviewDecorator, alongside both new callbacks", () => {
      const componentIndex = editorSurfaceSource.indexOf(
        "<GlossaryPreviewDecorator"
      );
      const closeIndex = editorSurfaceSource.indexOf("/>", componentIndex);
      const propsBlock = editorSurfaceSource.slice(componentIndex, closeIndex);

      expect(propsBlock).toContain("documentOpenId={documentOpenId}");
      expect(propsBlock).toContain(
        "previewRenderStartedAt={previewRenderStartedAt}"
      );
      expect(propsBlock).toContain(
        "onPreviewDomCommitted={onDocumentOpenPreviewDomCommitted}"
      );
      expect(propsBlock).toContain(
        "onPreviewDecorationCompleted={onDocumentOpenPreviewDecorationCompleted}"
      );
    });

    it("App.tsx's handlers ignore a documentOpenId that does not match the in-flight measurement, mirroring handleDocumentOpenMeasured's guard", () => {
      const domCommittedStart = appSource.indexOf(
        "function handleDocumentOpenPreviewDomCommitted("
      );
      const domCommittedEnd = appSource.indexOf(
        "function handleDocumentOpenPreviewDecorationCompleted("
      );
      const domCommittedBody = appSource.slice(
        domCommittedStart,
        domCommittedEnd
      );
      const decorationCompletedStart = domCommittedEnd;
      const decorationCompletedEnd = appSource.indexOf(
        "function replaceSavedDocument(",
        decorationCompletedStart
      );
      const decorationCompletedBody = appSource.slice(
        decorationCompletedStart,
        decorationCompletedEnd
      );

      expect(domCommittedStart).toBeGreaterThan(-1);
      for (const body of [domCommittedBody, decorationCompletedBody]) {
        expect(body).toContain(
          "documentOpenMeasurement.documentOpenId !== documentOpenId"
        );
      }

      expect(domCommittedBody).toContain(
        'event: "document.open.previewDom.committed"'
      );
      expect(decorationCompletedBody).toContain(
        'event: "document.open.previewDecoration.completed"'
      );
    });

    it("GlossaryPreviewDecorator reads documentOpenId and previewRenderStartedAt from render closure rather than the layout effect's dependency array, so an ordinary content edit cannot resurrect a since-cleared documentOpenId", () => {
      const effectStart = glossaryPreviewDecoratorSource.indexOf(
        "useLayoutEffect(() => {"
      );
      const effectEnd = glossaryPreviewDecoratorSource.indexOf(
        "}, [previewHtml, surfaceIndex]);"
      );

      expect(effectStart).toBeGreaterThan(-1);
      expect(effectEnd).toBeGreaterThan(effectStart);
    });

    it("guards both new measurements against React StrictMode's double layout-effect invocation with separate refs, one per event", () => {
      expect(glossaryPreviewDecoratorSource).toContain(
        "const reportedPreviewDomCommitDocumentOpenIdRef = useRef<string | null>("
      );
      expect(glossaryPreviewDecoratorSource).toContain(
        "const reportedPreviewDecorationDocumentOpenIdRef = useRef<string | null>("
      );

      const effectStart = glossaryPreviewDecoratorSource.indexOf(
        "useLayoutEffect(() => {"
      );
      const effectEnd = glossaryPreviewDecoratorSource.indexOf(
        "}, [previewHtml, surfaceIndex]);"
      );
      const effectBody = glossaryPreviewDecoratorSource.slice(
        effectStart,
        effectEnd
      );

      expect(effectBody).toContain(
        "reportedPreviewDomCommitDocumentOpenIdRef.current !== documentOpenId"
      );
      expect(effectBody).toContain(
        "reportedPreviewDomCommitDocumentOpenIdRef.current = documentOpenId;"
      );
      expect(effectBody).toContain(
        "reportedPreviewDecorationDocumentOpenIdRef.current !== documentOpenId"
      );
      expect(effectBody).toContain(
        "reportedPreviewDecorationDocumentOpenIdRef.current = documentOpenId;"
      );
    });

    it("does not fire either callback when documentOpenId is null (ordinary content edits, not a document open)", () => {
      const effectStart = glossaryPreviewDecoratorSource.indexOf(
        "useLayoutEffect(() => {"
      );
      const effectEnd = glossaryPreviewDecoratorSource.indexOf(
        "}, [previewHtml, surfaceIndex]);"
      );
      const effectBody = glossaryPreviewDecoratorSource.slice(
        effectStart,
        effectEnd
      );

      expect(effectBody).toContain(
        "if (\n      documentOpenId &&\n      reportedPreviewDomCommitDocumentOpenIdRef.current !== documentOpenId\n    )"
      );
      expect(effectBody).toContain(
        "if (\n      documentOpenId &&\n      reportedPreviewDecorationDocumentOpenIdRef.current !== documentOpenId\n    )"
      );
    });

    it("measures previewDom.committed duration from previewRenderStartedAt (comparable to previewRender.completed) and previewDecoration.completed duration from its own local start mark, not cumulative", () => {
      expect(glossaryPreviewDecoratorSource).toContain(
        "durationSincePerformanceMark(previewRenderStartedAt)"
      );
      expect(glossaryPreviewDecoratorSource).toContain(
        "const decorationStartedAt = performance.now();"
      );
      expect(glossaryPreviewDecoratorSource).toContain(
        "durationSincePerformanceMark(decorationStartedAt)"
      );
    });

    it("computes decoration node/match counts from values already produced while walking and replacing text nodes, without a second traversal", () => {
      const decorateStart = glossaryPreviewDecoratorSource.indexOf(
        "function decoratePreviewContainer("
      );
      const decorateEnd = glossaryPreviewDecoratorSource.indexOf(
        "export function GlossaryPreviewDecorator("
      );
      const decorateBody = glossaryPreviewDecoratorSource.slice(
        decorateStart,
        decorateEnd
      );

      // Only one TreeWalker traversal (the pre-existing one) — no additional
      // document.createTreeWalker call added for measurement purposes.
      const treeWalkerCount = (
        decorateBody.match(/document\.createTreeWalker/g) ?? []
      ).length;

      expect(treeWalkerCount).toBe(1);
      expect(decorateBody).toContain("visitedTextNodeCount: textNodes.length");
    });

    it("does not call logRendererDebugEvent directly in GlossaryPreviewDecorator or EditorSurface — logging stays centralized in App.tsx", () => {
      expect(glossaryPreviewDecoratorSource).not.toContain(
        "logRendererDebugEvent"
      );
      expect(editorSurfaceSource).not.toContain("logRendererDebugEvent");
    });

    it("does not include preview HTML, manuscript text, or glossary surface text in any detail payload in these files", () => {
      for (const source of [
        appSource,
        editorSurfaceSource,
        glossaryPreviewDecoratorSource
      ]) {
        expect(source).not.toMatch(/details:\s*{[^}]*previewHtml/);
        expect(source).not.toMatch(/details:\s*{[^}]*manuscriptText/);
        expect(source).not.toMatch(/details:\s*{[^}]*glossarySurface/);
      }
    });
  });

  describe("remaining document-open gap decomposition (#154 follow-up)", () => {
    it("MarkdownEditorSurface's one-shot effect reports previewRender.started before previewRender.completed, guarded by the same reportedDocumentOpenIdRef", () => {
      const effectStart = editorSurfaceSource.indexOf(
        "useEffect(() => {\n    if (documentOpenId"
      );
      const effectEnd = editorSurfaceSource.indexOf("}, [documentOpenId]);");

      expect(effectStart).toBeGreaterThan(-1);
      expect(effectEnd).toBeGreaterThan(effectStart);

      const effectBody = editorSurfaceSource.slice(effectStart, effectEnd);
      const startedIndex = effectBody.indexOf(
        "onDocumentOpenPreviewRenderStarted(documentOpenId, previewRenderStartedAt);"
      );
      const renderedIndex = effectBody.indexOf(
        "onDocumentOpenPreviewRendered(documentOpenId, previewRenderDurationMs, {"
      );

      expect(startedIndex).toBeGreaterThan(-1);
      expect(renderedIndex).toBeGreaterThan(startedIndex);
      // Both calls sit inside the same `reportedDocumentOpenIdRef.current !==
      // documentOpenId` branch — only one ref, so StrictMode's guard covers
      // both calls together (no separate duplicate-report risk for started).
      expect(effectBody).toContain(
        "reportedDocumentOpenIdRef.current !== documentOpenId"
      );
    });

    it("App.tsx computes previewRender.started's durationMs from documentOpenMeasurement.startedAt (openStartedAt), not applyStartedAt or previewRenderDurationMs", () => {
      const body = functionBody(
        appSource,
        "function handleDocumentOpenPreviewRenderStarted("
      );

      expect(body).toContain('event: "document.open.previewRender.started"');
      expect(body).toContain(
        "previewRenderStartedAt - documentOpenMeasurement.startedAt"
      );
      expect(body).toContain(
        "documentOpenMeasurement.documentOpenId !== documentOpenId"
      );
    });

    it("App.tsx's handleDocumentOpenPreviewFrameObserved ignores a documentOpenId that does not match the in-flight measurement", () => {
      const body = functionBody(
        appSource,
        "function handleDocumentOpenPreviewFrameObserved("
      );

      expect(body).toContain('event: "document.open.previewFrame.observed"');
      expect(body).toContain(
        "documentOpenMeasurement.documentOpenId !== documentOpenId"
      );
      expect(body).toContain("details: { documentOpenId, durationMs }");
    });

    it("threads onDocumentOpenPreviewRenderStarted and onDocumentOpenPreviewFrameObserved from App.tsx through EditorSurface", () => {
      const componentIndex = appSource.indexOf("<EditorSurface");
      const closeIndex = appSource.indexOf("/>", componentIndex);
      const propsBlock = appSource.slice(componentIndex, closeIndex);

      expect(propsBlock).toContain(
        "onDocumentOpenPreviewRenderStarted={\n                      handleDocumentOpenPreviewRenderStarted\n                    }"
      );
      expect(propsBlock).toContain(
        "onDocumentOpenPreviewFrameObserved={\n                      handleDocumentOpenPreviewFrameObserved\n                    }"
      );

      const markdownCaseStart = editorSurfaceSource.indexOf('case "markdown":');
      const markdownCaseEnd = editorSurfaceSource.indexOf(
        'case "glossaryEntry":'
      );
      const markdownCase = editorSurfaceSource.slice(
        markdownCaseStart,
        markdownCaseEnd
      );

      expect(markdownCase).toContain("onDocumentOpenPreviewRenderStarted");
      expect(markdownCase).toContain("onDocumentOpenPreviewFrameObserved");
    });

    it("MarkdownEditorSurface passes onPreviewFrameObserved down to GlossaryPreviewDecorator", () => {
      const componentIndex = editorSurfaceSource.indexOf(
        "<GlossaryPreviewDecorator"
      );
      const closeIndex = editorSurfaceSource.indexOf("/>", componentIndex);
      const propsBlock = editorSurfaceSource.slice(componentIndex, closeIndex);

      expect(propsBlock).toContain(
        "onPreviewFrameObserved={onDocumentOpenPreviewFrameObserved}"
      );
    });

    it("only schedules a requestAnimationFrame when documentOpenId is set (no per-keystroke overhead on ordinary edits)", () => {
      const effectStart = glossaryPreviewDecoratorSource.indexOf(
        "useLayoutEffect(() => {"
      );
      const effectEnd = glossaryPreviewDecoratorSource.indexOf(
        "}, [previewHtml, surfaceIndex]);"
      );
      const effectBody = glossaryPreviewDecoratorSource.slice(
        effectStart,
        effectEnd
      );

      expect(effectBody).toContain("if (documentOpenId) {");
      expect(effectBody).toContain("requestAnimationFrame(() => {");
    });

    it("gates the previewFrame.observed report inside the requestAnimationFrame callback, not at schedule time — required so StrictMode's mount/cleanup/mount double-invocation still reports exactly once", () => {
      const effectStart = glossaryPreviewDecoratorSource.indexOf(
        "useLayoutEffect(() => {"
      );
      const effectEnd = glossaryPreviewDecoratorSource.indexOf(
        "}, [previewHtml, surfaceIndex]);"
      );
      const effectBody = glossaryPreviewDecoratorSource.slice(
        effectStart,
        effectEnd
      );
      const rafIndex = effectBody.indexOf("requestAnimationFrame(() => {");
      const guardIndex = effectBody.indexOf(
        "reportedPreviewFrameDocumentOpenIdRef.current !== frameDocumentOpenId"
      );

      expect(rafIndex).toBeGreaterThan(-1);
      expect(guardIndex).toBeGreaterThan(rafIndex);
    });

    it("cancels a pending frame request in the effect's cleanup, so a superseded open's previewFrame.observed never fires", () => {
      expect(glossaryPreviewDecoratorSource).toContain(
        "let frameRequestId: number | null = null;"
      );
      expect(glossaryPreviewDecoratorSource).toContain(
        "return () => {\n      if (frameRequestId !== null) {\n        cancelAnimationFrame(frameRequestId);\n      }\n    };"
      );
    });

    it("captures documentOpenId into a local const before scheduling the frame, so the deferred report can't read a since-changed prop value", () => {
      expect(glossaryPreviewDecoratorSource).toContain(
        "const frameDocumentOpenId = documentOpenId;"
      );
      expect(glossaryPreviewDecoratorSource).toContain(
        "onPreviewFrameObserved(\n            frameDocumentOpenId,"
      );
    });

    it("does not add a CodeMirror-mount measurement event — MarkdownEditor's editor-view effect has an empty dependency array and does not re-fire per document open", () => {
      const markdownEditorSource = readFileSync(
        "src/renderer/MarkdownEditor.tsx",
        "utf8"
      );

      expect(markdownEditorSource).not.toContain("documentOpenId");
      expect(markdownEditorSource).not.toContain("logRendererDebugEvent");
      expect(appSource).not.toContain("document.open.codemirror.ready");
    });
  });
});
