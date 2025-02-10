export default defineContentScript({
  matches: ['*://xcp.io/*'],
  async main(ctx) {
    try {
      await injectScript("/injected.js", {
        keepInDom: true,
      });
      console.log('Injected xcpwallet successfully.');
    } catch (error) {
      console.error('Failed to inject xcpwallet:', error);
    }
  },
});
