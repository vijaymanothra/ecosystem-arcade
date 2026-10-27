// The one Azure Function: every /api/* request goes to the shared scores API.
'use strict';

const { app } = require('@azure/functions');
const { liveHandler } = require('../handler');

app.http('scores', {
  route: '{*path}',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous', // players don't sign in; the API itself validates, rate-limits and guards DELETE
  handler: async (request, context) => {
    try {
      return await liveHandler()(request);
    } catch (err) {
      context.error(err);
      return { status: 500, jsonBody: { error: 'server error' } };
    }
  },
});
