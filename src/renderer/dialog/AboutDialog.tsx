import {
  useEffect,
  useRef,
  useState,
  type CSSProperties
} from "react";
import type { PergamumAppInfo } from "../../shared/api";
import { APP_INFO_EXTERNAL_LINKS } from "../../shared/api";
import type { Translate } from "../../shared/i18n";
import appIconUrl from "../../../assets/icon.png?url";
import checkSquareIconUrl from "../../../assets/icons/feather/dialog/check-square.svg?url";
import clipboardIconUrl from "../../../assets/icons/feather/dialog/clipboard.svg?url";
import externalLinkIconUrl from "../../../assets/icons/feather/dialog/external-link.svg?url";
import xCircleIconUrl from "../../../assets/icons/feather/dialog/x-circle.svg?url";
import logoUrl from "../../../assets/logo/logo-outlined.svg?url";
import {
  performClipboardCopy,
  type ClipboardAdapter
} from "./clipboardAdapter";
import { InfoDialog } from "./InfoDialog";

export interface AboutDialogProps {
  appInfo: PergamumAppInfo;
  translate: Translate;
  clipboardAdapter: ClipboardAdapter;
  opener: Element | null;
  onClose: () => void;
  onOpenRepository: () => void;
  onOpenTypewriterSoundsCredit: () => void;
}

type TechnicalInfoCopyState = "idle" | "copied" | "failed";
const TECHNICAL_INFO_COPY_FEEDBACK_FADE_MS = 1500;
const TECHNICAL_INFO_COPY_FEEDBACK_TOTAL_MS =
  TECHNICAL_INFO_COPY_FEEDBACK_FADE_MS * 2;

function normalizedTechnicalInfoValue(value: string): string {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : "Unknown";
}

export function formatAboutTechnicalInformation(
  appInfo: PergamumAppInfo
): string {
  const runtime = appInfo.runtime;

  return [
    `Pergamum: ${normalizedTechnicalInfoValue(appInfo.version)}`,
    `Electron: ${normalizedTechnicalInfoValue(runtime.electron)}`,
    `Chromium: ${normalizedTechnicalInfoValue(runtime.chromium)}`,
    `Node.js: ${normalizedTechnicalInfoValue(runtime.node)}`,
    `V8: ${normalizedTechnicalInfoValue(runtime.v8)}`,
    `OS: ${normalizedTechnicalInfoValue(runtime.osType)} ${normalizedTechnicalInfoValue(runtime.osRelease)}`,
    `Platform: ${normalizedTechnicalInfoValue(runtime.platform)} ${normalizedTechnicalInfoValue(runtime.arch)}`
  ].join("\n");
}

export function AboutDialog({
  appInfo,
  translate,
  clipboardAdapter,
  opener,
  onClose,
  onOpenRepository,
  onOpenTypewriterSoundsCredit
}: AboutDialogProps): JSX.Element {
  const [copyState, setCopyState] =
    useState<TechnicalInfoCopyState>("idle");
  const [isCopyingTechnicalInfo, setIsCopyingTechnicalInfo] = useState(false);
  const isCopyingTechnicalInfoRef = useRef(false);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const technicalInformation = formatAboutTechnicalInformation(appInfo);
  const copyFeedback =
    copyState === "copied"
      ? translate("dialog.about.copyTechnicalInfoCopied")
      : copyState === "failed"
        ? translate("dialog.about.copyTechnicalInfoFailed")
        : null;
  const copyTechnicalInfoIconUrl =
    copyState === "copied"
      ? checkSquareIconUrl
      : copyState === "failed"
        ? xCircleIconUrl
        : clipboardIconUrl;
  const copyToastStyle = {
    "--about-dialog-copy-feedback-animation-ms": `${TECHNICAL_INFO_COPY_FEEDBACK_TOTAL_MS}ms`
  } as CSSProperties;

  function clearCopyFeedbackTimer(): void {
    if (copyFeedbackTimerRef.current !== null) {
      clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
  }

  function showCopyFeedback(nextState: Exclude<TechnicalInfoCopyState, "idle">) {
    clearCopyFeedbackTimer();
    setCopyState(nextState);
    copyFeedbackTimerRef.current = setTimeout(() => {
      copyFeedbackTimerRef.current = null;
      setCopyState("idle");
    }, TECHNICAL_INFO_COPY_FEEDBACK_TOTAL_MS);
  }

  useEffect(() => {
    return () => {
      clearCopyFeedbackTimer();
    };
  }, []);

  async function handleCopyTechnicalInformation(): Promise<void> {
    if (isCopyingTechnicalInfoRef.current) {
      return;
    }

    isCopyingTechnicalInfoRef.current = true;
    setIsCopyingTechnicalInfo(true);
    let copySucceeded = false;

    try {
      const result = await performClipboardCopy(
        clipboardAdapter,
        technicalInformation
      );
      copySucceeded = result.ok;
    } catch {
      copySucceeded = false;
    } finally {
      isCopyingTechnicalInfoRef.current = false;
      setIsCopyingTechnicalInfo(false);
    }

    showCopyFeedback(copySucceeded ? "copied" : "failed");
  }

  return (
    <InfoDialog
      title={translate("dialog.about.title")}
      opener={opener}
      hideVisualTitle
      onClose={onClose}
      footer={
        <div className="aboutDialogFooterContent">
          <div className="aboutDialogTechnicalInfoControl">
            <button
              type="button"
              className="appDialogButton aboutDialogCopyTechnicalButton"
              aria-label={translate("dialog.about.copyTechnicalInfo")}
              title={translate("dialog.about.copyTechnicalInfo")}
              disabled={isCopyingTechnicalInfo}
              onClick={() => {
                void handleCopyTechnicalInformation();
              }}
            >
              <img
                className="aboutDialogCopyTechnicalIcon"
                src={copyTechnicalInfoIconUrl}
                alt=""
                aria-hidden="true"
              />
            </button>
            {copyFeedback ? (
              <span
                className={`aboutDialogCopyToast aboutDialogCopyToast-${copyState}`}
                role="status"
                aria-live="polite"
                style={copyToastStyle}
              >
                {copyFeedback}
              </span>
            ) : null}
          </div>
          <div className="appDialogActions">
            <button
              type="button"
              className="appDialogButton appDialogButton-confirm"
              autoFocus
              onClick={onClose}
            >
              {translate("common.close")}
            </button>
          </div>
        </div>
      }
    >
      <div className="aboutDialogContent">
        <div className="aboutDialogBranding">
          <img
            className="aboutDialogAppIcon"
            src={appIconUrl}
            alt={translate("dialog.about.appIconAlt")}
          />
          <img
            className="aboutDialogLogo"
            src={logoUrl}
            alt={translate("dialog.about.logoAlt")}
          />
        </div>

        <p className="aboutDialogTagline">
          {translate("dialog.about.tagline")}
        </p>

        <dl className="aboutDialogMetadata">
          <div className="aboutDialogMetadataRow">
            <dt>{translate("dialog.about.versionLabel")}</dt>
            <dd>{appInfo.version}</dd>
          </div>
          <div className="aboutDialogMetadataRow">
            <dt>{translate("dialog.about.licenseLabel")}</dt>
            <dd>{appInfo.license}</dd>
          </div>
          <div className="aboutDialogMetadataRow">
            <dt>{translate("dialog.about.copyrightLabel")}</dt>
            <dd>{appInfo.copyright}</dd>
          </div>
        </dl>

        <section className="aboutDialogSection">
          <h3>{translate("dialog.about.repositoryLabel")}</h3>
          <button
            type="button"
            className="aboutDialogLinkButton"
            aria-label={translate("dialog.about.openRepository")}
            title={APP_INFO_EXTERNAL_LINKS.repository}
            onClick={onOpenRepository}
          >
            <span>{translate("dialog.about.repositoryName")}</span>
            {"\u00a0"}
            <img
              className="aboutDialogExternalLinkIcon"
              src={externalLinkIconUrl}
              alt=""
              aria-hidden="true"
            />
          </button>
        </section>

        <section className="aboutDialogSection">
          <h3>{translate("dialog.about.thirdPartyLabel")}</h3>
          <p>{translate("dialog.about.thirdPartySummary")}</p>
          <p>{translate("dialog.about.thirdPartyGuidance")}</p>
        </section>

        <section className="aboutDialogSection">
          <h3>{translate("dialog.about.creditsLabel")}</h3>
          <button
            type="button"
            className="aboutDialogLinkButton"
            aria-label={translate("dialog.about.openTypewriterSoundsCredit")}
            title={APP_INFO_EXTERNAL_LINKS.typewriterSoundsCredit}
            onClick={onOpenTypewriterSoundsCredit}
          >
            <span>{translate("dialog.about.typewriterCredit")}</span>
            {"\u00a0"}
            <img
              className="aboutDialogExternalLinkIcon"
              src={externalLinkIconUrl}
              alt=""
              aria-hidden="true"
            />
          </button>
        </section>
      </div>
    </InfoDialog>
  );
}
