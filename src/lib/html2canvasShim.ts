import html2canvas from 'html2canvas';

let tempCanvas: HTMLCanvasElement | null = null;
let tempCtx: CanvasRenderingContext2D | null = null;

function resolveUnsupportedColor(colorStr: string): string {
  if (!colorStr.includes('oklch') && !colorStr.includes('oklab')) return colorStr;
  
  if (!tempCanvas) {
    if (typeof document !== 'undefined') {
      tempCanvas = document.createElement('canvas');
      tempCanvas.width = 1;
      tempCanvas.height = 1;
      tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    }
  }
  
  if (!tempCtx) return colorStr;
  
  try {
    tempCtx.fillStyle = colorStr;
    const resolved = tempCtx.fillStyle;
    
    // If browser successfully resolved it to non-oklch/oklab (hex, rgb, etc.) style
    if (resolved && !resolved.includes('oklch') && !resolved.includes('oklab')) {
      return resolved;
    }
    
    // Fallback: draw 1x1 pixel and read back
    tempCtx.clearRect(0, 0, 1, 1);
    tempCtx.fillRect(0, 0, 1, 1);
    const imgData = tempCtx.getImageData(0, 0, 1, 1).data;
    const alpha = (imgData[3] / 255).toFixed(3);
    return `rgba(${imgData[0]}, ${imgData[1]}, ${imgData[2]}, ${alpha})`;
  } catch (e) {
    return colorStr;
  }
}

function convertColorsInString(str: string): string {
  if (!str || typeof str !== 'string' || (!str.includes('oklch') && !str.includes('oklab'))) {
    return str;
  }
  return str.replace(/(oklch|oklab)\([^\)]+\)/g, (match) => {
    return resolveUnsupportedColor(match);
  });
}

export function safeHtml2canvas(element: HTMLElement, options?: any): Promise<HTMLCanvasElement> {
  // 1. Monkeypatch window.getComputedStyle
  const originalGetComputedStyle = window.getComputedStyle;
  
  window.getComputedStyle = function (elt, pseudoElt) {
    const style = originalGetComputedStyle(elt, pseudoElt);
    
    // Create Proxy to dynamically resolve OKLCH and OKLAB colors returned by getComputedStyle
    return new Proxy(style, {
      get(target, prop) {
        // Do NOT pass the proxy (receiver) to Reflect.get on native DOM objects to prevent "Illegal invocation" errors
        const val = Reflect.get(target, prop);
        
        if (typeof val === 'string') {
          return convertColorsInString(val);
        }
        
        if (typeof val === 'function') {
          return function (...args: any[]) {
            const res = Reflect.apply(val, target, args);
            if (typeof res === 'string') {
              return convertColorsInString(res);
            }
            return res;
          };
        }
        
        return val;
      }
    }) as CSSStyleDeclaration;
  };

  // 2. Monkeypatch document.styleSheets to filter out rules containing OKLCH or OKLAB
  const originalStyleSheets = document.styleSheets;
  
  // Create filtered proxies of the stylesheets
  const proxiedStyleSheets = Array.from(originalStyleSheets).map((sheet) => {
    try {
      // Test if we can read cssRules (could be blocked by CORS for external sheets)
      const rules = sheet.cssRules;
      if (!rules) return sheet;
      
      const filteredRules = Array.from(rules).filter((rule) => {
        // Drop any rule containing OKLCH or OKLAB syntax
        return !rule.cssText.includes('oklch(') && !rule.cssText.includes('oklab(');
      });
      
      // Create a Proxy of CSSStyleSheet to intercept cssRules and return filtered rules
      return new Proxy(sheet, {
        get(target, prop) {
          if (prop === 'cssRules' || prop === 'rules') {
            return filteredRules;
          }
          // Do NOT pass receiver here either to avoid "Illegal invocation" on other properties of CSSStyleSheet
          const val = Reflect.get(target, prop);
          if (typeof val === 'function') {
            return val.bind(target);
          }
          return val;
        }
      });
    } catch (e) {
      // CORS blocked or other issues, return original sheet safely
      return sheet;
    }
  });

  // Find high-level stylesheets descriptor to redefine safely
  let restored = false;
  const docProto = Object.getPrototypeOf(document);
  const originalDocDescriptor = Object.getOwnPropertyDescriptor(docProto, 'styleSheets') 
    || Object.getOwnPropertyDescriptor(document, 'styleSheets');
    
  try {
    Object.defineProperty(document, 'styleSheets', {
      get() {
        return proxiedStyleSheets as unknown as StyleSheetList;
      },
      configurable: true
    });
  } catch (e) {
    console.warn('Could not override document.styleSheets via defineProperty, trying direct property write', e);
    try {
      (document as any).styleSheets = proxiedStyleSheets;
    } catch (err) {
      console.error('Failed to override document.styleSheets', err);
    }
  }

  const restore = () => {
    if (restored) return;
    restored = true;
    window.getComputedStyle = originalGetComputedStyle;
    
    // Restore document.styleSheets
    if (originalDocDescriptor) {
      try {
        Object.defineProperty(document, 'styleSheets', originalDocDescriptor);
      } catch (e) {
        try {
          Object.defineProperty(docProto, 'styleSheets', originalDocDescriptor);
        } catch (err) {
          console.error('Could not restore styleSheets descriptor', err);
        }
      }
    } else {
      try {
        delete (document as any).styleSheets;
      } catch (e) {
        // ignore
      }
    }
  };

  return html2canvas(element, options)
    .then((canvas) => {
      restore();
      return canvas;
    })
    .catch((err) => {
      restore();
      throw err;
    });
}
