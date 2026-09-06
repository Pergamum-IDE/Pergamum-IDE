import React from "react";

export interface DocumentDialogueRatioBarChartPair {
  readonly pairIndex: number;
  /** Localized display label, e.g. "会話文 「 ～ 」" or "Dialogue \" ... \"" */
  readonly label?: string;
  readonly open?: string;
  readonly close?: string;
  readonly color: string;
  readonly characters: number;
  readonly percent?: number;
}

export interface DocumentDialogueRatioBarChartProps {
  readonly narrationCharacters: number;
  readonly narrationLabel: string;
  readonly pairs: readonly DocumentDialogueRatioBarChartPair[];
  readonly ariaLabel: string;
  readonly animationKey?: number;
}

export function DocumentDialogueRatioBarChart({
  narrationCharacters,
  narrationLabel,
  pairs,
  ariaLabel,
  animationKey
}: DocumentDialogueRatioBarChartProps): JSX.Element {
  const counts = [narrationCharacters, ...pairs.map((p) => p.characters)];
  const maxCount = Math.max(1, ...counts);
  const totalCharacters = counts.reduce((sum, c) => sum + c, 0);
  const isEmpty = !Number.isFinite(totalCharacters) || totalCharacters <= 0;

  const narrationRatio = totalCharacters > 0 ? (narrationCharacters / maxCount) * 100 : 0;

  return (
    <div
      className="documentMetricsDialogueBarWrap"
      role="img"
      aria-label={ariaLabel}
      data-empty={isEmpty ? "true" : undefined}
    >
      <div
        className="documentMetricsDialogueBar"
        data-revealing={animationKey !== undefined ? "true" : undefined}
        key={animationKey}
      >
        <div className="documentMetricsBarRow" key="narration">
          <span className="documentMetricsBarLabel" title={narrationLabel}>
            {narrationLabel}
          </span>
          <div className="documentMetricsBarTrack">
            <div
              className="documentMetricsBarFill documentMetricsBarFill--narration"
              style={
                {
                  "--bar-width": `${narrationRatio}%`,
                  "--bar-delay": "0ms"
                } as React.CSSProperties
              }
            />
          </div>
          <span className="documentMetricsBarValue">
            {narrationCharacters.toLocaleString()}
          </span>
        </div>

        {pairs.map((pair, index) => {
          const pairLabel =
            pair.label ??
            (pair.open !== undefined && pair.close !== undefined
              ? `${pair.open} ... ${pair.close}`
              : "");
          const ratio = totalCharacters > 0 ? (pair.characters / maxCount) * 100 : 0;
          const delay = Math.min((index + 1) * 45, 200);

          return (
            <div className="documentMetricsBarRow" key={pair.pairIndex}>
              <span
                className="documentMetricsBarLabel"
                title={pairLabel}
                style={{ color: pair.color }}
              >
                {pairLabel}
              </span>
              <div className="documentMetricsBarTrack">
                <div
                  className="documentMetricsBarFill"
                  style={
                    {
                      "--bar-width": `${ratio}%`,
                      "--bar-delay": `${delay}ms`,
                      backgroundColor: pair.color
                    } as React.CSSProperties
                  }
                />
              </div>
              <span className="documentMetricsBarValue">
                {pair.characters.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
