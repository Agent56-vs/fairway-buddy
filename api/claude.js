// Fairway Buddy's only server code. The browser runs MediaPipe and the tools; this function
// adds the API key, the system prompts and the tool definitions, then forwards one turn to Claude.
// Keeping prompts and tools here means the site can't be used as an open Claude proxy.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const LANDMARK_NAMES = [
  "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer",
  "left_ear", "right_ear", "mouth_left", "mouth_right", "left_shoulder", "right_shoulder", "left_elbow",
  "right_elbow", "left_wrist", "right_wrist", "left_pinky", "right_pinky", "left_index", "right_index",
  "left_thumb", "right_thumb", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle",
  "right_ankle", "left_heel", "right_heel", "left_foot_index", "right_foot_index",
];
const LM = { type: "string", enum: LANDMARK_NAMES };

// Strict tools get schema-checked arguments: every property required, no extras.
function tool(name, description, properties = {}) {
  return {
    name, description, strict: true,
    input_schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
  };
}

const SWING_SYSTEM = `You are Fairway Buddy, a warm, encouraging junior golf coach for kids aged 8-14. You review phone videos of a child's golf swing.

You have on-device body tracking (Google MediaPipe Pose Landmarker) available as tools. Use them to look closely before you judge:
- Start by calling get_swing_metrics and get_player_history (you can call both at once).
- If something looks off or the numbers seem noisy, dig in with get_landmarks, measure_angle or track_landmark.
- If the key moment (top of backswing, impact, finish) falls between frames, call analyze_more_frames on that part of the clip. You'll get new frames with the tracked skeleton drawn on.
- MediaPipe is a 2D estimate from one camera and can be wrong (baggy clothes, a club hiding an arm, poor light). When the images and numbers disagree, trust the images and lower your confidence.

You are also learning about this golfer over time:
- Your coach notes (in the first message) are things you chose to remember from earlier sessions. Use them.
- get_player_history shows earlier swings, their numbers, your ratings, and whether the golfer or their real coach agreed with you. Where they disagreed, learn from the correction and calibrate today's ratings to match.
- Compare today's numbers with their personal averages, not just textbook values. Celebrate real improvement.
- When you learn something lasting (which way they film, a recurring fault, what their normal numbers look like, a correction from their coach), save it with save_coach_note. Keep notes short and factual. Delete notes that turn out to be wrong or outdated. Don't save anything personal beyond golf.

Coaching rules: judge only what is visible. Never comment on the child's body shape or size. Use simple words a kid understands. Measurements help you be accurate, but don't quote numbers to the child.

Finish by calling submit_feedback exactly once with 3 checks: "Posture at address", "Head steadiness" and "Finish balance" (rating 1-5 each, one plain sentence tip each), plus one drill that uses only things found at home.`;

const SAVE_NOTE = tool("save_coach_note", "Remember something lasting about this golfer for future sessions. One short factual sentence.", { note: { type: "string" } });
const DELETE_NOTE = tool("delete_coach_note", "Delete one of your coach notes that is wrong or outdated.", { id: { type: "string" } });

const SWING_TOOLS = [
  tool("get_swing_metrics", "Summary measurements from MediaPipe across all frames analyzed so far: head movement, knee flex, hip hinge and spine tilt at address, lead arm and shoulder/hip turn at the top, finish balance and a rough tempo ratio. Lengths are a percent of the golfer's height."),
  tool("get_landmarks", "Key body landmarks for one frame: x, y (normalized; x is scaled by the frame's aspect ratio so distances match on both axes; y grows downward) and visibility 0-1.",
    { frame: { type: "integer", description: "Frame index" } }),
  tool("measure_angle", "Angle in degrees at landmark b, formed by landmarks a-b-c, in one frame. For example left_hip, left_knee, left_ankle gives knee flex.",
    { frame: { type: "integer" }, a: LM, b: LM, c: LM }),
  tool("track_landmark", "Path of one landmark across every analyzed frame, in time order: frame index, time in ms, x, y, visibility.", { landmark: LM }),
  tool("analyze_more_frames", "Pull extra frames from part of the video, run MediaPipe on them and add them to the analysis. Use this to catch a key moment that falls between frames. Returns the new frame indices and shows you the frames with the skeleton drawn on.", {
    from_pct: { type: "number", description: "Start of the window, 0-100 percent of the clip" },
    to_pct: { type: "number", description: "End of the window, 0-100 percent of the clip" },
    count: { type: "integer", description: "How many frames, 2-6" },
  }),
  tool("get_player_history", "This golfer's earlier analyzed swings (newest first, up to 8): date, MediaPipe metrics, the ratings you gave, and whether they or their coach agreed, with any correction. Also their personal average for each metric."),
  SAVE_NOTE,
  DELETE_NOTE,
  tool("submit_feedback", "Give the golfer your feedback. Call once, at the end.", {
    summary: { type: "string", description: "Max 2 friendly sentences" },
    checks: {
      type: "array", items: {
        type: "object",
        properties: { name: { type: "string" }, rating: { type: "integer", description: "1-5" }, tip: { type: "string", description: "One plain sentence" } },
        required: ["name", "rating", "tip"], additionalProperties: false,
      },
    },
    drill: { type: "string", description: "One drill sentence using only things found at home" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  }),
];

const DRILL_SYSTEM = `You are Fairway Buddy, a friendly junior golf coach. A child (age 8-14) tells you where they practice and what they have.
Create safe, fun golf drills using ONLY what they mention (or no equipment). No real golf balls or clubs indoors, and keep each drill safe for the space.
Use simple words. Finish by calling submit_drills.`;

const DRILL_TOOLS = [tool("submit_drills", "Return the drills.", {
  drills: {
    type: "array", items: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short name" },
        needs: { type: "string", description: "Items used, or 'nothing'" },
        steps: { type: "string", description: "2-3 short kid-friendly sentences" },
        goal: { type: "string", description: "One measurable goal" },
      },
      required: ["name", "needs", "steps", "goal"], additionalProperties: false,
    },
  },
})];

const REFLECT_SYSTEM = `You are Fairway Buddy, a junior golf coach that keeps short notes about each golfer so it gets better over time.
You gave feedback on a swing and the golfer (or their real coach) disagreed. Work out what you should do differently next time
and record it as a coach note, or update an existing note. Be specific: tie the lesson to what the measurements showed, so you can
apply it to future swings (for example: "Knee flex around 150 deg at address is normal for this golfer; their coach says posture is fine, so don't mark it down").
If the correction is unclear or not about golf, save nothing. Finish by calling done.`;

const REFLECT_TOOLS = [
  tool("save_coach_note", "Save a short lesson about this golfer.", { note: { type: "string" } }),
  tool("delete_coach_note", "Delete a note that this correction shows was wrong.", { id: { type: "string" } }),
  tool("done", "Finish."),
];

const TASKS = {
  swing: { system: SWING_SYSTEM, tools: SWING_TOOLS, effort: "medium", maxMessages: 30 },
  drills: { system: DRILL_SYSTEM, tools: DRILL_TOOLS, effort: "low", maxMessages: 6 },
  reflect: { system: REFLECT_SYSTEM, tools: REFLECT_TOOLS, effort: "low", maxMessages: 10 },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Optional: set ACCESS_CODE so only people you give the code to can spend your API credit.
  const code = process.env.ACCESS_CODE;
  if (code && req.headers["x-access-code"] !== code) return res.status(401).json({ error: "Access code needed", code: "access" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const task = TASKS[body.task];
  const messages = body.messages;
  if (!task || !Array.isArray(messages) || messages.length === 0 || messages.length > task.maxMessages ||
      messages.some((m) => m.role !== "user" && m.role !== "assistant")) {
    return res.status(400).json({ error: "Bad request" });
  }

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: task.system, cache_control: { type: "ephemeral" } }],
      tools: task.tools,
      output_config: { effort: task.effort },
      // If a safety classifier declines, the API retries on its recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    });
    // The browser echoes `content` back unchanged on the next turn.
    return res.status(200).json({ content: response.content, stop_reason: response.stop_reason });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Too many requests", code: "rate_limited" });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API error ${e.status ?? ""}`.trim(), code: String(e.status ?? "") });
    return res.status(500).json({ error: "Server error" });
  }
}
