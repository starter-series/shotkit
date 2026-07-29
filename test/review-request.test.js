const {
  ReviewRequestError,
  validateCampaignReview,
  validateReviewDecision,
  validateSingleReview,
} = require('../src/review-request');

const digest = 'a'.repeat(64);
const profileHash = 'b'.repeat(64);

function expectReviewError(run, status, message) {
  expect(run).toThrow(expect.objectContaining({
    name: 'ReviewRequestError',
    status,
    message,
  }));
}

test('validates shared review status and feedback rules', () => {
  expect(() => validateReviewDecision({ status: 'approved' })).not.toThrow();
  expectReviewError(
    () => validateReviewDecision({ status: 'changes-requested', note: '  ' }),
    400,
    'review feedback is required when changes are requested',
  );
  expectReviewError(
    () => validateReviewDecision({ status: 'approved', note: 'x'.repeat(2001) }),
    400,
    'review feedback must be at most 2000 characters',
  );
  expect(new ReviewRequestError(409, 'stale')).toMatchObject({ status: 409, message: 'stale' });
});

test('builds an atomic campaign decision only for current reviewable candidates', () => {
  const recipe = {
    id: 'launch',
    story: 'demo',
    targets: [{ id: 'x' }, { id: 'youtube-shorts' }],
  };
  const current = {
    targets: [
      { story: 'demo', target: 'x', reviewable: true, assetDigest: digest, profileHash: null },
      { story: 'demo', target: 'youtube-shorts', reviewable: true, assetDigest: digest, profileHash },
    ],
  };
  const body = {
    recipeId: 'launch',
    status: 'approved',
    candidates: [
      { target: 'x', assetDigest: digest },
      { target: 'youtube-shorts', assetDigest: digest, profileHash },
    ],
  };

  expect(validateCampaignReview({ body, recipes: [recipe], current }).decisions).toEqual([
    { story: 'demo', target: 'x', decision: { status: 'approved', assetDigest: digest, note: undefined } },
    {
      story: 'demo',
      target: 'youtube-shorts',
      decision: { status: 'approved', assetDigest: digest, profileHash, note: undefined },
    },
  ]);
  expectReviewError(
    () => validateCampaignReview({
      body: { ...body, candidates: [body.candidates[0], { ...body.candidates[0] }] },
      recipes: [recipe],
      current,
    }),
    400,
    'review candidates contain an unavailable or duplicate target',
  );
  expectReviewError(
    () => validateCampaignReview({
      body: { ...body, candidates: [{ ...body.candidates[0], assetDigest: profileHash }] },
      recipes: [recipe],
      current,
    }),
    409,
    'review candidate is stale; reload the final media before deciding',
  );
});

test('validates one review candidate against the selected final media', () => {
  const selected = {
    story: 'demo',
    target: 'youtube-shorts',
    reviewable: true,
    assetDigest: digest,
    profileHash,
  };
  const body = {
    story: selected.story,
    target: selected.target,
    status: 'changes-requested',
    note: 'Move the result higher.',
    assetDigest: digest,
    profileHash,
  };
  expect(validateSingleReview({ body, current: { targets: [selected] } })).toEqual({
    selected,
    decision: {
      status: 'changes-requested',
      assetDigest: digest,
      profileHash,
      note: 'Move the result higher.',
    },
  });
});
