import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          language?: string;
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

const TurnstileWidget = ({ onVerify, onError, onExpire }: TurnstileWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(null);

  // Fetch site key from edge function
  useEffect(() => {
    const fetchSiteKey = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-turnstile-sitekey");
        if (error) {
          console.error("Error fetching Turnstile site key:", error);
          return;
        }
        if (data?.siteKey) {
          setSiteKey(data.siteKey);
        }
      } catch (error) {
        console.error("Error fetching Turnstile site key:", error);
      }
    };
    fetchSiteKey();
  }, []);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current || !siteKey) return;

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
        "error-callback": onError,
        "expired-callback": onExpire,
        theme: "auto",
        language: "pt-br",
      });
    } catch (error) {
      console.error("Error rendering Turnstile widget:", error);
    }
  }, [onVerify, onError, onExpire, siteKey]);

  useEffect(() => {
    // Check if script already loaded
    if (window.turnstile) {
      setIsLoaded(true);
      return;
    }

    // Check if script is already in DOM
    const existingScript = document.querySelector('script[src*="turnstile"]');
    if (existingScript) {
      window.onloadTurnstileCallback = () => setIsLoaded(true);
      return;
    }

    // Load Turnstile script
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback";
    script.async = true;
    script.defer = true;

    window.onloadTurnstileCallback = () => setIsLoaded(true);

    document.head.appendChild(script);

    return () => {
      delete window.onloadTurnstileCallback;
    };
  }, []);

  useEffect(() => {
    if (isLoaded) {
      renderWidget();
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        } catch (error) {
          console.error("Error removing Turnstile widget:", error);
        }
      }
    };
  }, [isLoaded, renderWidget]);

  if (!siteKey) {
    return (
      <div className="flex justify-center my-4">
        <div className="h-[65px] w-[300px] bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="flex justify-center my-4"
    />
  );
};

export default TurnstileWidget;
