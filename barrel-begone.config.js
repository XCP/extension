export default {
  cwd: process.cwd(),
  maxModuleGraphSize: 50, // Allow up to 50 modules in the graph
  amountOfExportsToConsiderModuleAsBarrel: 3, // Consider a file a barrel if it has 3+ exports
  info: true // Enable extra logging
};