import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  analyzeCSP, 
  meetsSecurityRequirements,
  getCSPSecurityAdvice 
} from '../cspValidation';

// Mock fetch globally
global.fetch = vi.fn();

describe('cspValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('analyzeCSP', () => {
    it('should detect missing CSP headers', async () => {
      // Mock fetch to return no CSP headers
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockReturnValue(null)
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.hasCSP).toBe(false);
      expect(analysis.isSecure).toBe(false);
      expect(analysis.warnings).toContain('No CSP headers found - site is vulnerable to injection attacks');
      expect(analysis.recommendations).toContain('Implement Content Security Policy headers');
    });

    it('should parse secure CSP headers correctly', async () => {
      const cspHeader = "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.hasCSP).toBe(true);
      expect(analysis.isSecure).toBe(true);
      expect(analysis.warnings).toHaveLength(0);
      expect(analysis.directives).toEqual({
        'default-src': ['\'self\''],
        'script-src': ['\'self\''],
        'object-src': ['\'none\''],
        'base-uri': ['\'self\'']
      });
    });

    it('should detect unsafe-inline in CSP', async () => {
      const cspHeader = "default-src 'self'; script-src 'self' 'unsafe-inline'";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.hasCSP).toBe(true);
      expect(analysis.isSecure).toBe(false);
      expect(analysis.warnings).toContain('Allows inline scripts - vulnerable to XSS attacks');
    });

    it('should detect unsafe-eval in CSP', async () => {
      const cspHeader = "script-src 'self' 'unsafe-eval'";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.warnings).toContain('Allows eval() - can execute arbitrary code');
    });

    it('should detect wildcard sources', async () => {
      const cspHeader = "script-src *";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.warnings).toContain('Allows scripts from any source - reduces security');
    });

    it('should detect data: sources', async () => {
      const cspHeader = "script-src 'self' data:";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.warnings).toContain('Allows scripts from any source - reduces security');
    });

    it('should recommend missing object-src directive', async () => {
      const cspHeader = "default-src 'self'; script-src 'self'";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.warnings).toContain('Should set object-src to \'none\' to prevent plugin exploitation');
    });

    it('should recommend missing base-uri directive', async () => {
      const cspHeader = "default-src 'self'; script-src 'self'; object-src 'none'";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.warnings).toContain('Missing base-uri directive - vulnerable to base tag injection');
    });

    it('should handle X-Content-Security-Policy headers', async () => {
      const cspHeader = "default-src 'self'";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'x-content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.hasCSP).toBe(true);
      expect(analysis.directives).toEqual({
        'default-src': ['\'self\'']
      });
    });

    it('should handle X-WebKit-CSP headers', async () => {
      const cspHeader = "default-src 'self'";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'x-webkit-csp') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.hasCSP).toBe(true);
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.hasCSP).toBe(false);
      expect(analysis.isSecure).toBe(false);
      expect(analysis.recommendations).toContain('Unable to analyze CSP - connection failed');
      expect(analysis.warnings).toContain('Could not fetch site headers');
    });

    it('should generate recommendations for missing directives', async () => {
      const cspHeader = "default-src 'self'"; // Missing many recommended directives
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.recommendations).toContain('Add script-src: \'self\'');
      expect(analysis.recommendations).toContain('Add object-src: \'none\'');
      expect(analysis.recommendations).toContain('Add base-uri: \'self\'');
    });

    it('should recommend restricting wildcard script sources', async () => {
      const cspHeader = "script-src *";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.recommendations).toContain('Restrict script-src from \'*\' to specific domains');
    });

    it('should handle complex CSP with multiple values', async () => {
      const cspHeader = "default-src 'self'; script-src 'self' https://trusted.com 'nonce-random123'; img-src 'self' data: https:";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.directives['script-src']).toEqual(['\'self\'', 'https://trusted.com', '\'nonce-random123\'']);
      expect((analysis.directives as any)['img-src']).toEqual(['\'self\'', 'data:', 'https:']);
    });

    it('should handle empty CSP values', async () => {
      const cspHeader = "default-src; script-src 'self'";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const analysis = await analyzeCSP('https://example.com');

      expect(analysis.directives['script-src']).toEqual(['\'self\'']);
      expect(analysis.directives['default-src']).toBeUndefined();
    });
  });

  describe('meetsSecurityRequirements', () => {
    it('should return true for sites with good CSP', async () => {
      const cspHeader = "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const result = await meetsSecurityRequirements('https://example.com');
      expect(result).toBe(true);
    });

    it('should return true but warn for sites with poor CSP', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockReturnValue(null) // No CSP
        }
      });

      const result = await meetsSecurityRequirements('https://example.com');
      
      expect(result).toBe(true); // Still allow connection
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('CSP security issues'),
        expect.objectContaining({
          hasCSP: false,
          warnings: expect.arrayContaining([expect.stringContaining('No CSP headers found')])
        })
      );

      consoleSpy.mockRestore();
    });

    it('should return true for sites with warnings', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cspHeader = "script-src 'unsafe-inline'";
      
      (global.fetch as any).mockResolvedValue({
        headers: {
          get: vi.fn().mockImplementation((header) => {
            if (header === 'content-security-policy') return cspHeader;
            return null;
          })
        }
      });

      const result = await meetsSecurityRequirements('https://example.com');
      
      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getCSPSecurityAdvice', () => {
    it('should return security advice array', () => {
      const advice = getCSPSecurityAdvice();
      
      expect(Array.isArray(advice)).toBe(true);
      expect(advice.length).toBeGreaterThan(0);
      expect(advice).toContain('Implement Content Security Policy (CSP) headers on your Web3 site');
      expect(advice).toContain('Use script-src \'self\' to only allow scripts from your domain');
      expect(advice).toContain('Avoid unsafe-inline and unsafe-eval in script-src');
    });

    it('should include all key security recommendations', () => {
      const advice = getCSPSecurityAdvice();
      
      const expectedAdvice = [
        'Content Security Policy',
        'script-src \'self\'',
        'object-src \'none\'',
        'base-uri \'self\'',
        'frame-ancestors \'none\'',
        'unsafe-inline',
        'unsafe-eval'
      ];

      expectedAdvice.forEach(expected => {
        expect(advice.some(item => item.includes(expected))).toBe(true);
      });
    });
  });
});