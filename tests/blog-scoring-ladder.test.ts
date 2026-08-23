import assert from "node:assert/strict";
import test from "node:test";
import scoringRules from "../server/7k/config/scoring-rules.v2.0.json" with { type: "json" };
import transitions from "../server/7k/config/transitions-70.v1.json" with { type: "json" };

test("blog levels distinguish absence, an inactive first platform, and episodic publishing", () => {
  const levels = scoringRules.elements.blog.levels;
  assert.match(levels[0].criterion, /Блога.+площадки нет/u);
  assert.match(levels[1].criterion, /Площадка создана.+первые подписчики.+неактивен/u);
  assert.match(levels[2].criterion, /эпизодически|нерегулярно/u);
  assert.match(levels[3].criterion, /большую часть недель/u);
});

test("the 70-transition registry uses the same first blog maturity steps", () => {
  const blog = new Map(
    transitions.transitions
      .filter((item) => item.element_id === "blog")
      .map((item) => [item.task_id, item]),
  );
  assert.match(blog.get("blog_0_1")!.task, /создать.+площадк/iu);
  assert.match(blog.get("blog_1_2")!.current_state, /первые подписчики.+неактивен/u);
  assert.match(blog.get("blog_2_3")!.current_state, /эпизодически|нерегулярно/u);
});
