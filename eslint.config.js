import barrelFiles from 'eslint-plugin-barrel-files';

export default [
  {
    plugins: {
      'barrel-files': barrelFiles
    },
    rules: {
      // Prevent barrel file exports
      'barrel-files/avoid-barrel-files': 'error',
      // Prevent importing from barrel files
      'barrel-files/avoid-importing-barrel-files': 'error',
      // Prevent re-exporting from barrel files
      'barrel-files/avoid-re-export-all': 'error',
      // Prevent namespace imports from barrel files
      'barrel-files/avoid-namespace-import': 'warn'
    }
  }
];