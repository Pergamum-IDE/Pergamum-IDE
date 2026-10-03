import { describe, expect, it } from "vitest";
import { USAGE_TOUR_STEPS } from "../../../src/renderer/usageTour/usageTourSteps";
import { USAGE_TOUR_TARGETS } from "../../../src/renderer/usageTour/usageTourTypes";
import { t } from "../../../src/shared/i18n";

describe("USAGE_TOUR_STEPS", () => {
  it("defines exactly 13 steps", () => {
    expect(USAGE_TOUR_STEPS).toHaveLength(13);
  });

  it("does not contain hardcoded text or Japanese characters in step definitions", () => {
    const japaneseRegex = /[ぁ-んァ-ヶ一-龠々]/;
    for (const step of USAGE_TOUR_STEPS) {
      expect((step as any).title).toBeUndefined();
      expect((step as any).content).toBeUndefined();
      expect(step.titleKey).toMatch(/^usageTour\.step\.[a-zA-Z0-9]+\.title$/);
      expect(step.bodyKey).toMatch(/^usageTour\.step\.[a-zA-Z0-9]+\.body$/);
      expect(japaneseRegex.test(JSON.stringify(step))).toBe(false);
    }
  });

  it("has target-free centered placement for step 1 and step 13", () => {
    expect(USAGE_TOUR_STEPS[0].targetId).toBeUndefined();
    expect(USAGE_TOUR_STEPS[12].targetId).toBeUndefined();
  });

  it("targets Activity Bar buttons for steps 2 to 6 with right placement preference", () => {
    const activitySteps = USAGE_TOUR_STEPS.slice(1, 6);
    expect(activitySteps.map((s) => s.targetId)).toEqual([
      USAGE_TOUR_TARGETS.activityFiles,
      USAGE_TOUR_TARGETS.activitySearch,
      USAGE_TOUR_TARGETS.activityGlossary,
      USAGE_TOUR_TARGETS.activityDocumentMap,
      USAGE_TOUR_TARGETS.activityDocumentMetrics
    ]);
    activitySteps.forEach((step) => {
      expect(step.preferredPlacement).toBe("right");
    });
  });

  it("targets Toolbar buttons for steps 7 to 12 with bottom placement preference", () => {
    const toolbarSteps = USAGE_TOUR_STEPS.slice(6, 12);
    expect(toolbarSteps.map((s) => s.targetId)).toEqual([
      USAGE_TOUR_TARGETS.toolbarCommandPalette,
      USAGE_TOUR_TARGETS.toolbarImage,
      USAGE_TOUR_TARGETS.toolbarCallout,
      USAGE_TOUR_TARGETS.toolbarMarkdownLinter,
      USAGE_TOUR_TARGETS.toolbarJapaneseLinter,
      USAGE_TOUR_TARGETS.toolbarPreview
    ]);
    toolbarSteps.forEach((step) => {
      expect(step.preferredPlacement).toBe("bottom");
    });
  });

  it("resolves exact Japanese FIX copy for all steps", () => {
    expect(t("ja", USAGE_TOUR_STEPS[0].titleKey)).toBe("ようこそ");
    expect(t("ja", USAGE_TOUR_STEPS[0].bodyKey)).toBe(
      "Pergamumにようこそ。\n" +
      "本アプリケーションは、Markdownファイルやテキストファイルで文章を書くことに特化したエディタです。\n" +
      "これから、Pergamumの主な機能をご案内します。"
    );

    expect(t("ja", USAGE_TOUR_STEPS[1].titleKey)).toBe("ファイルエクスプローラー");
    expect(t("ja", USAGE_TOUR_STEPS[1].bodyKey)).toBe(
      "これは【ファイルエクスプローラー】です。\n" +
      "Pergamumでは、【プロジェクト】という単位で文書ファイル群をまとめて管理します。\n" +
      "ファイルエクスプローラーでは、プロジェクト内のファイルやフォルダを確認・管理できます。"
    );

    expect(t("ja", USAGE_TOUR_STEPS[2].titleKey)).toBe("検索");
    expect(t("ja", USAGE_TOUR_STEPS[2].bodyKey)).toBe(
      "これは【検索】です。\n" +
      "プロジェクト内の文書をまとめて検索できます。\n" +
      "特定の言葉がどこに書かれているか探したいときや、複数の文書を横断して確認したいときに利用します。"
    );

    expect(t("ja", USAGE_TOUR_STEPS[3].titleKey)).toBe("語彙集");
    expect(t("ja", USAGE_TOUR_STEPS[3].bodyKey)).toBe(
      "これは【語彙集】です。\n" +
      "登場人物、地名、用語など、執筆中に参照したい情報を登録できます。\n" +
      "登録した語彙は、本文を書きながら確認したり、入力を補助したりするために利用できます。\n" +
      "語彙は自由に登録することができ、タグで分類・管理することもできます。使い方はあなた次第です。"
    );

    expect(t("ja", USAGE_TOUR_STEPS[4].titleKey)).toBe("文書マップ");
    expect(t("ja", USAGE_TOUR_STEPS[4].bodyKey)).toBe(
      "これは【文書マップ】です。\n" +
      "文書全体を俯瞰し、文章のどのあたりを表示・編集しているか確認できます。\n" +
      "地の文、会話文、登録語彙に紐付くタグ色などで文書の構成を描画します。\n" +
      "長い文書の中を移動したり、会話文の配分などを把握する目安としてお使いください。"
    );

    expect(t("ja", USAGE_TOUR_STEPS[5].titleKey)).toBe("文書メトリクス");
    expect(t("ja", USAGE_TOUR_STEPS[5].bodyKey)).toBe(
      "これは【文書メトリクス】です。\n" +
      "文書の文字数など、現在の文書に関する情報を確認できます。\n" +
      "原稿の分量や文章の状態を把握したいときに利用してください。"
    );

    expect(t("ja", USAGE_TOUR_STEPS[6].titleKey)).toBe("コマンドパレット");
    expect(t("ja", USAGE_TOUR_STEPS[6].bodyKey)).toBe(
      "これは【コマンドパレット】です。\n" +
      "Pergamumのさまざまな機能を、名前から探して実行できます。\n" +
      "「>」で始まるときはコマンド一覧を表示しますが、モードを切り替えることで、さまざまな機能を利用できます。\n" +
      "「あの機能はどこにあったかな？」というときは、まずここを開いてみてください。"
    );

    expect(t("ja", USAGE_TOUR_STEPS[7].titleKey)).toBe("画像の挿入");
    expect(t("ja", USAGE_TOUR_STEPS[7].bodyKey)).toBe(
      "これは【画像の挿入】です。\n" +
      "Markdown文書へ画像を挿入するときに利用します。\n" +
      "挿入したい位置にカーソルを置いて、このボタンから画像を選択してください。\n" +
      "クリップボードからの画像ペーストにも対応しています。"
    );

    expect(t("ja", USAGE_TOUR_STEPS[8].titleKey)).toBe("コールアウト");
    expect(t("ja", USAGE_TOUR_STEPS[8].bodyKey)).toBe(
      "これは【コールアウト】です。\n" +
      "Note、Tip、Warningなど、本文中に目立つ囲み表示を挿入できます。\n" +
      "補足や注意書きなどを本文と区別して表現したいときに利用します。\n" +
      "コールアウトはMarkdownの方言にあたる記法のため、利用する環境によっては意図したとおりに表示されない場合があります。"
    );

    expect(t("ja", USAGE_TOUR_STEPS[9].titleKey)).toBe("Markdown Linter");
    expect(t("ja", USAGE_TOUR_STEPS[9].bodyKey)).toBe(
      "これは【Markdown Linter】です。\n" +
      "Markdownの書式や記述を確認し、問題のある箇所を見つけるための機能です。\n" +
      "Markdownとして正しく記述できているか確認したいときに利用します。"
    );

    expect(t("ja", USAGE_TOUR_STEPS[10].titleKey)).toBe("日本語 Linter");
    expect(t("ja", USAGE_TOUR_STEPS[10].bodyKey)).toBe(
      "これは【日本語 Linter】です。\n" +
      "日本語の文章を確認し、表記や文章上の問題を見つけるための機能です。\n" +
      "生成AIを使用せずにチェックを行うため、文章量に応じてCPUへの負荷が増加します。\n" +
      "原稿を見直す際のチェックとして利用してください。"
    );

    expect(t("ja", USAGE_TOUR_STEPS[11].titleKey)).toBe("プレビュー");
    expect(t("ja", USAGE_TOUR_STEPS[11].bodyKey)).toBe(
      "これは【プレビュー】です。\n" +
      "Markdownで書いた原稿がどのように表示されるか、本文と並べて確認できます。\n" +
      "このボタンでプレビューの表示・非表示を切り替えられます。\n" +
      "プレビューの既定の表示方法は、アプリケーション設定から変更できます。"
    );

    expect(t("ja", USAGE_TOUR_STEPS[12].titleKey)).toBe("ツアー完了");
    expect(t("ja", USAGE_TOUR_STEPS[12].bodyKey)).toBe(
      "使い方ツアーは以上です。\n" +
      "Pergamumには、このほかにも執筆を支援するさまざまな機能があります。\n" +
      "本ツアーを再度見たくなったときは、「ヘルプ」→「使い方ツアー」から実行できます。"
    );
  });

  it("resolves English copy for all steps with no Japanese characters", () => {
    const japaneseRegex = /[ぁ-んァ-ヶ一-龠々]/;
    for (const step of USAGE_TOUR_STEPS) {
      const enTitle = t("en", step.titleKey);
      const enBody = t("en", step.bodyKey);
      expect(enTitle.length).toBeGreaterThan(0);
      expect(enBody.length).toBeGreaterThan(0);
      expect(japaneseRegex.test(enTitle)).toBe(false);
      expect(japaneseRegex.test(enBody)).toBe(false);
    }

    expect(t("en", USAGE_TOUR_STEPS[0].titleKey)).toBe("Welcome");
    expect(t("en", USAGE_TOUR_STEPS[6].titleKey)).toBe("Command Palette");
    expect(t("en", USAGE_TOUR_STEPS[12].titleKey)).toBe("Tour Complete");
  });
});
