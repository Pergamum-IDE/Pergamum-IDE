import { useState, type JSX } from "react";
import type { RecentProject } from "../shared/api";
import type { Language, Translate } from "../shared/i18n";
import type { AppPlatform } from "../shared/platform";
import {
  getEnabledWelcomeTips,
  getNextTipIndex,
  getPreviousTipIndex,
  getWelcomeTipText,
  resolveWelcomeTipTextTokens,
  type WelcomeTip
} from "../shared/welcomeTips";
import {
  arrowLeftIconRaw,
  arrowRightIconRaw,
  closeIconRaw,
  getWelcomeTipIconRaw
} from "./welcomeTipIcons";
import logoUrl from "../../assets/logo/logo-outlined.svg?url";

interface WelcomeScreenProps {
  recentProjects: RecentProject[];
  translate: Translate;
  language?: Language;
  platform?: AppPlatform;
  onCreateProject: () => void;
  onOpenProject: () => void;
  onOpenRecentProject: (projectFilePath: string) => void;
  onRemoveRecentProject?: (projectId: string) => void;
}

function shuffleArray<T>(array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export function WelcomeScreen({
  recentProjects,
  translate,
  language = "ja",
  platform = "windows",
  onCreateProject,
  onOpenProject,
  onOpenRecentProject,
  onRemoveRecentProject
}: WelcomeScreenProps): JSX.Element {
  const [tips] = useState<readonly WelcomeTip[]>(() =>
    shuffleArray(getEnabledWelcomeTips())
  );
  const [currentTipIndex, setCurrentTipIndex] = useState<number>(0);

  const currentTip = tips.length > 0 ? tips[currentTipIndex] : null;

  function handleNextTip(): void {
    if (tips.length === 0) return;
    setCurrentTipIndex((prev) => getNextTipIndex(prev, tips.length));
  }

  function handlePreviousTip(): void {
    if (tips.length === 0) return;
    setCurrentTipIndex((prev) => getPreviousTipIndex(prev, tips.length));
  }

  function handleOpenExternalLink(url: string): void {
    if (url.startsWith("https://")) {
      void window.pergamum.appInfo.openExternalUrl(url);
    }
  }

  return (
    <section className="welcomeScreen" aria-label={translate("welcome.title")}>
      <div className="welcomeContent">
        <section className="welcomePrimary" aria-label={translate("welcome.start")}>
          <div className="welcomeHero">
            <img
              className="welcomeLogo"
              src={logoUrl}
              alt={translate("welcome.title")}
            />
            <p>{translate("welcome.description")}</p>
          </div>

          <div className="welcomeProjectActions">
            <button
              type="button"
              className="welcomeCreateProject"
              onClick={onCreateProject}
            >
              {translate("welcome.createProject")}
            </button>
            <button
              type="button"
              className="welcomeOpenProject"
              onClick={onOpenProject}
            >
              {translate("welcome.openProject")}
            </button>
          </div>

          {currentTip !== null ? (
            <div className="welcomeTipCard" aria-label={translate("welcome.tipsTitle")}>
              <div className="welcomeTipHeader">
                <span
                  className="welcomeTipIcon"
                  dangerouslySetInnerHTML={{
                    __html: getWelcomeTipIconRaw(currentTip.icon)
                  }}
                />
                <h3 className="welcomeTipTitle">
                  {resolveWelcomeTipTextTokens(
                    getWelcomeTipText(currentTip, language).title,
                    platform
                  )}
                </h3>
              </div>

              <p className="welcomeTipBody">
                {resolveWelcomeTipTextTokens(
                  getWelcomeTipText(currentTip, language).body,
                  platform
                )}
              </p>

              {currentTip.link !== null &&
              currentTip.link.url.startsWith("https://") ? (
                <div className="welcomeTipLinkContainer">
                  <button
                    type="button"
                    className="welcomeTipLink"
                    onClick={() => handleOpenExternalLink(currentTip.link!.url)}
                  >
                    {language === "ja"
                      ? currentTip.link.label.ja
                      : currentTip.link.label.en}
                  </button>
                </div>
              ) : null}

              <div className="welcomeTipFooter">
                <span className="welcomeTipCounter">
                  Tip {currentTipIndex + 1} / {tips.length}
                </span>
                <div className="welcomeTipNavButtons">
                  <button
                    type="button"
                    className="welcomeTipNavBtn"
                    title={translate("welcome.previousTip")}
                    aria-label={translate("welcome.previousTip")}
                    onClick={handlePreviousTip}
                  >
                    <span
                      dangerouslySetInnerHTML={{ __html: arrowLeftIconRaw }}
                    />
                    <span>{translate("welcome.previousTip")}</span>
                  </button>
                  <button
                    type="button"
                    className="welcomeTipNavBtn"
                    title={translate("welcome.nextTip")}
                    aria-label={translate("welcome.nextTip")}
                    onClick={handleNextTip}
                  >
                    <span>{translate("welcome.nextTip")}</span>
                    <span
                      dangerouslySetInnerHTML={{ __html: arrowRightIconRaw }}
                    />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section
          className="welcomeRecent"
          aria-label={translate("welcome.recentProjects")}
        >
          <h2>{translate("welcome.recentProjects")}</h2>
          {recentProjects.length === 0 ? (
            <div className="welcomeRecentEmpty">{translate("recent.empty")}</div>
          ) : (
            <nav
              className="welcomeRecentList"
              aria-label={translate("welcome.recentProjects")}
            >
              {recentProjects.map((recentProject) => (
                <div
                  key={recentProject.projectId}
                  className="welcomeRecentRow"
                >
                  <button
                    type="button"
                    className="welcomeRecentItem"
                    title={recentProject.projectFilePath}
                    onClick={() =>
                      onOpenRecentProject(recentProject.projectFilePath)
                    }
                  >
                    <span className="welcomeRecentName">
                      {recentProject.projectName}
                    </span>
                    <span className="welcomeRecentPath">
                      {recentProject.projectFilePath}
                    </span>
                  </button>
                  {onRemoveRecentProject ? (
                    <button
                      type="button"
                      className="welcomeRecentRemove"
                      title={translate("welcome.recentRemove")}
                      aria-label={translate("welcome.recentRemove")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveRecentProject(recentProject.projectId);
                      }}
                    >
                      <span
                        dangerouslySetInnerHTML={{ __html: closeIconRaw }}
                      />
                    </button>
                  ) : null}
                </div>
              ))}
            </nav>
          )}
        </section>
      </div>
    </section>
  );
}
