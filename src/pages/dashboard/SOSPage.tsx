import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function SOSPage() {
  const [loading, setLoading] = useState(false);

  const handleSOS = async () => {
    setLoading(true);
    try {
      // Basic payload with condition logs
      const payload: any = {
        name: "Shrisha",
        age: 22,
        conditions: ["Diabetes"],
        bloodSugar: 210,
        contacts: []
      };

      // Get the current session to authenticate the raw fetch request
      const { data: { session } } = await supabase.auth.getSession();
      
      // Fetch user's family members to get valid phone numbers from dashboard!
      if (session?.user) {
         const { data: familyMembers } = await supabase
           .from("family_members")
           .select("phone_number")
           .eq("user_id", session.user.id);
         
         if (familyMembers && familyMembers.length > 0) {
            payload.contacts = familyMembers
              .map(m => m.phone_number)
              .filter(Boolean); // removes nulls/empty strings
         }
      }

      // Some templates use VITE_SUPABASE_PUBLISHABLE_KEY, others use VITE_SUPABASE_ANON_KEY
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const token = session?.access_token || anonKey; 

      // Use raw fetch to bypass `supabase.functions.invoke` generic HTTP errors
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://jsarrbcvnyrnyekvkjev.supabase.co";
      const response = await fetch(`${supabaseUrl}/functions/v1/sos-alert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": anonKey
        },
        body: JSON.stringify(payload)
      });

      // The Edge Function now strictly returns JSON, even for 500 statuses
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status} Error`);
      }

      alert("SOS Alert Sent to Emergency Contacts!");

    } catch (error: any) {
      console.error("SOS Error:", error);
      alert("Error sending SOS: " + (error.message || "Please try again"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-4 text-center animate-fade-in">
      <div className="max-w-md w-full p-8 rounded-3xl bg-card border border-border shadow-xl">
        <AlertTriangle className="h-16 w-16 text-danger mx-auto mb-6 animate-pulse" />
        <h1 className="text-3xl font-bold text-foreground mb-4">Emergency SOS</h1>
        <p className="text-muted-foreground mb-8 text-lg">
          Pressing this button will instantly alert your emergency contacts and trigger a voice call.
        </p>
        
        <Button 
          size="lg" 
          onClick={handleSOS} 
          disabled={loading}
          className="w-full text-xl h-20 rounded-2xl bg-danger hover:bg-danger/90 text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
        >
          {loading ? (
            <><Loader2 className="h-8 w-8 mr-3 animate-spin" /> Sending...</>
          ) : (
            "TRIGGER SOS"
          )}
        </Button>
      </div>
    </div>
  );
}
