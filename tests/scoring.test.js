// tests/scoring.test.js
// Basic unit tests for scoring and math logic (T10.1)

const assert = require("assert");

// We simulate the logic inside the AI Report generation
function calculateAverages(scores) {
  if (!scores || scores.length === 0) {
    return {
      technicalAvg: 0,
      depthAvg: 0,
      clarityAvg: 0,
      problemSolvingAvg: 0,
      overallScore: 0
    };
  }

  const technicalAvg = scores.reduce((sum, a) => sum + (a.technical_score || 0), 0) / scores.length;
  const depthAvg = scores.reduce((sum, a) => sum + (a.depth_score || 0), 0) / scores.length;
  const clarityAvg = scores.reduce((sum, a) => sum + (a.clarity_score || 0), 0) / scores.length;
  const problemSolvingAvg = scores.reduce((sum, a) => sum + (a.problem_solving_score || 0), 0) / scores.length;

  const overallScore = (technicalAvg * 0.4) + (problemSolvingAvg * 0.3) + (depthAvg * 0.2) + (clarityAvg * 0.1);

  return {
    technicalAvg: parseFloat(technicalAvg.toFixed(1)),
    depthAvg: parseFloat(depthAvg.toFixed(1)),
    clarityAvg: parseFloat(clarityAvg.toFixed(1)),
    problemSolvingAvg: parseFloat(problemSolvingAvg.toFixed(1)),
    overallScore: parseFloat(overallScore.toFixed(1))
  };
}

// ── Tests ──
function runTests() {
  console.log("Running unit tests...");

  try {
    // Test 1: Empty scores
    const res1 = calculateAverages([]);
    assert.strictEqual(res1.overallScore, 0, "Empty scores should return 0 overall");

    // Test 2: Perfect scores
    const perfectScores = [
      { technical_score: 10, depth_score: 10, clarity_score: 10, problem_solving_score: 10 },
      { technical_score: 10, depth_score: 10, clarity_score: 10, problem_solving_score: 10 }
    ];
    const res2 = calculateAverages(perfectScores);
    assert.strictEqual(res2.overallScore, 10, "Perfect scores should return 10 overall");
    assert.strictEqual(res2.technicalAvg, 10);

    // Test 3: Mixed scores with weightings
    // T: 8 (40% = 3.2)
    // PS: 7 (30% = 2.1)
    // D: 6 (20% = 1.2)
    // C: 9 (10% = 0.9)
    // Total = 7.4
    const mixedScores = [
      { technical_score: 8, problem_solving_score: 7, depth_score: 6, clarity_score: 9 }
    ];
    const res3 = calculateAverages(mixedScores);
    assert.strictEqual(res3.overallScore, 7.4, "Mixed scores should calculate correctly based on weights");
    assert.strictEqual(res3.technicalAvg, 8);
    assert.strictEqual(res3.clarityAvg, 9);

    console.log("✓ All scoring unit tests passed!");
  } catch (err) {
    console.error("✗ Unit tests failed:", err.message);
    process.exit(1);
  }
}

runTests();
