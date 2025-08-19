/**
 * Content Security Policy Validation
 * 
 * Validates that sites have secure CSP configurations before allowing connections.
 * This helps prevent injection attacks and ensures the site follows security best practices.
 */

interface CSPDirectives {
  'default-src'?: string[];
  'script-src'?: string[];
  'object-src'?: string[];
  'base-uri'?: string[];
  'frame-ancestors'?: string[];
  'form-action'?: string[];
}

interface CSPAnalysis {
  hasCSP: boolean;
  isSecure: boolean;
  recommendations: string[];
  warnings: string[];
  directives: CSPDirectives;
}

/**
 * Recommended CSP directives for Web3 sites
 */
const RECOMMENDED_CSP = {
  'default-src': ['\'self\''],
  'script-src': ['\'self\''], // No unsafe-inline, no unsafe-eval
  'object-src': ['\'none\''], // Blocks plugins
  'base-uri': ['\'self\''], // Prevents base tag injection
  'frame-ancestors': ['\'none\''], // Prevents clickjacking
  'form-action': ['\'self\''], // Restricts form submissions
};

/**
 * Parse CSP header into directives
 */
function parseCSP(cspHeader: string): CSPDirectives {
  const directives: CSPDirectives = {};
  
  const parts = cspHeader.split(';').map(part => part.trim()).filter(Boolean);
  
  for (const part of parts) {
    const [directive, ...values] = part.split(/\s+/);
    if (directive && values.length > 0) {
      directives[directive as keyof CSPDirectives] = values;
    }
  }
  
  return directives;
}

/**
 * Check if CSP allows unsafe practices
 */
function hasUnsafePractices(directives: CSPDirectives): string[] {
  const warnings: string[] = [];
  
  const scriptSrc = directives['script-src'] || directives['default-src'] || [];
  
  if (scriptSrc.includes('\'unsafe-inline\'')) {
    warnings.push('Allows inline scripts - vulnerable to XSS attacks');
  }
  
  if (scriptSrc.includes('\'unsafe-eval\'')) {
    warnings.push('Allows eval() - can execute arbitrary code');
  }
  
  if (scriptSrc.includes('*') || scriptSrc.includes('data:')) {
    warnings.push('Allows scripts from any source - reduces security');
  }
  
  if (!directives['object-src'] || !directives['object-src'].includes('\'none\'')) {
    warnings.push('Should set object-src to \'none\' to prevent plugin exploitation');
  }
  
  if (!directives['base-uri']) {
    warnings.push('Missing base-uri directive - vulnerable to base tag injection');
  }
  
  return warnings;
}

/**
 * Generate recommendations for better CSP
 */
function generateRecommendations(directives: CSPDirectives): string[] {
  const recommendations: string[] = [];
  
  Object.entries(RECOMMENDED_CSP).forEach(([directive, recommendedValues]) => {
    const currentValues = directives[directive as keyof CSPDirectives];
    
    if (!currentValues) {
      recommendations.push(`Add ${directive}: ${recommendedValues.join(' ')}`);
    } else {
      // Check if current values are less restrictive than recommended
      if (directive === 'script-src' && currentValues.includes('*')) {
        recommendations.push(`Restrict script-src from '*' to specific domains`);
      }
    }
  });
  
  return recommendations;
}

/**
 * Analyze a site's CSP configuration
 */
export async function analyzeCSP(origin: string): Promise<CSPAnalysis> {
  // Skip CSP checks for localhost and development environments
  const url = new URL(origin);
  const isDevelopment = url.hostname === 'localhost' || 
                       url.hostname === '127.0.0.1' || 
                       url.hostname.endsWith('.local') ||
                       url.port === '3000' || 
                       url.port === '3003';
  
  if (isDevelopment) {
    return {
      hasCSP: false,
      isSecure: true, // Consider development environments secure for testing
      recommendations: [],
      warnings: [], // No warnings for development
      directives: {}
    };
  }
  
  try {
    const response = await fetch(origin, { method: 'HEAD' });
    const cspHeader = response.headers.get('content-security-policy') || 
                     response.headers.get('x-content-security-policy') ||
                     response.headers.get('x-webkit-csp');
    
    if (!cspHeader) {
      return {
        hasCSP: false,
        isSecure: false,
        recommendations: [
          'Implement Content Security Policy headers',
          'Add script-src \'self\' to prevent XSS',
          'Add object-src \'none\' to block plugins',
          'Add base-uri \'self\' to prevent injection'
        ],
        warnings: ['No CSP headers found - site is vulnerable to injection attacks'],
        directives: {}
      };
    }
    
    const directives = parseCSP(cspHeader);
    const warnings = hasUnsafePractices(directives);
    const recommendations = generateRecommendations(directives);
    
    // Consider CSP secure if it has no major warnings
    const isSecure = warnings.length === 0;
    
    return {
      hasCSP: true,
      isSecure,
      recommendations,
      warnings,
      directives
    };
    
  } catch (error) {
    console.error('Error analyzing CSP:', error);
    return {
      hasCSP: false,
      isSecure: false,
      recommendations: ['Unable to analyze CSP - connection failed'],
      warnings: ['Could not fetch site headers'],
      directives: {}
    };
  }
}

/**
 * Check if site meets minimum security requirements for Web3 connections
 */
export async function meetsSecurityRequirements(origin: string): Promise<boolean> {
  const analysis = await analyzeCSP(origin);
  
  // For now, just warn about CSP issues but don't block connections
  // This could be made more strict in the future
  if (!analysis.hasCSP || analysis.warnings.length > 0) {
    console.warn(`CSP security issues for ${origin}:`, {
      hasCSP: analysis.hasCSP,
      warnings: analysis.warnings,
      recommendations: analysis.recommendations
    });
  }
  
  // Don't block connections for CSP issues yet - just log them
  return true;
}

/**
 * Get security advice for developers
 */
export function getCSPSecurityAdvice(): string[] {
  return [
    'Implement Content Security Policy (CSP) headers on your Web3 site',
    'Use script-src \'self\' to only allow scripts from your domain',
    'Set object-src \'none\' to prevent plugin-based attacks',
    'Add base-uri \'self\' to prevent base tag injection attacks',
    'Include frame-ancestors \'none\' to prevent clickjacking',
    'Avoid unsafe-inline and unsafe-eval in script-src',
    'Test your CSP with browser developer tools',
    'Monitor CSP violations with report-uri directive'
  ];
}