import assert from "node:assert/strict";
import test from "node:test";
import { SCORING_RULES as scoringRules } from "../server/7k/config/scoring-rules.v3.0";
import { TRANSITIONS_70_V2 as transitions } from "../server/7k/config/transitions-70.v2";

test("blog levels introduce AI before regular systemized publishing", () => {
  const levels = scoringRules.elements.blog.levels;
  assert.match(levels[0].criterion, /площадки нет/u);
  assert.match(levels[1].criterion, /Площадка создана.+первые публикации.+практически не ведётся/u);
  assert.match(levels[2].criterion, /AI помогает.+нерегулярны/u);
  assert.match(levels[3].criterion, /большую часть недель.+AI регулярно/u);
  assert.match(levels[6].criterion, /масштабируемая механика привлечения/u);
  assert.match(levels[7].criterion, /Минимум две самостоятельные медиаплощадки.+обращения или продажи/u);
  assert.match(levels[9].criterion, /делегированы.+роли имеют резерв/u);
  assert.match(levels[10].criterion, /Команда автономно управляет многоплощадочной медиасистемой/u);
});

test("the 70-transition registry uses the same first blog maturity steps", () => {
  const blog = new Map(
    transitions
      .filter((item) => item.element_id === "blog")
      .map((item) => [item.task_id, item]),
  );
  assert.match(blog.get("blog_0_1")!.task, /создать.+площадк/iu);
  assert.match(blog.get("blog_1_2")!.current_state, /первые публикации.+практически не ведётся/u);
  assert.match(blog.get("blog_2_3")!.current_state, /AI помогает.+нерегулярны/u);
});
