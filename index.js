
```javascript
import Anthropic from "@anthropic-ai/sdk";
import * as readline from "readline";

const client = new Anthropic();

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  times: string[];
  nextDue: Date;
}

interface ReminderApp {
  medications: Medication[];
  conversationHistory: Message[];
  checkReminders(): void;
  addMedication(
    name: string,
    dosage: string,
    frequency: string,
    times: string[]
  ): void;
  listMedications(): string;
  getMedicationInfo(): string;
}

function createReminderApp(): ReminderApp {
  const medications: Medication[] = [];
  const conversationHistory: Message[] = [];

  function calculateNextDue(times: string[]): Date {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const timeStr of times) {
      const [hours, minutes] = timeStr.split(":").map(Number);
      const nextDueTime = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        hours,
        minutes
      );

      if (nextDueTime > now) {
        return nextDueTime;
      }
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const [hours, minutes] = times[0].split(":").map(Number);
    return new Date(
      tomorrow.getFullYear(),
      tomorrow.getMonth(),
      tomorrow.getDate(),
      hours,
      minutes
    );
  }

  function addMedication(
    name: string,
    dosage: string,
    frequency: string,
    times: string[]
  ): void {
    const medication: Medication = {
      name,
      dosage,
      frequency,
      times,
      nextDue: calculateNextDue(times),
    };
    medications.push(medication);
  }

  function checkReminders(): void {
    const now = new Date();
    const upcomingReminders: Medication[] = [];

    for (const med of medications) {
      const timeDiff = med.nextDue.getTime() - now.getTime();
      if (timeDiff > 0 && timeDiff <= 30 * 60 * 1000) {
        upcomingReminders.push(med);
      }
    }

    if (upcomingReminders.length > 0) {
      console.log(
        "\n🔔 REMINDER: Time to take your medications soon:\n" +
          upcomingReminders
            .map(
              (med) =>
                `   - ${med.name} (${med.dosage}) at ${med.nextDue.toLocaleTimeString()}`
            )
            .join("\n")
      );
    }
  }

  function listMedications(): string {
    if (medications.length === 0) {
      return "No medications registered yet.";
    }

    return medications
      .map(
        (med) =>
          `• ${med.name}: ${med.dosage}, ${med.frequency} at ${med.times.join(", ")}`
      )
      .join("\n");
  }

  function getMedicationInfo(): string {
    return `Current medications registered:\n${listMedications()}\n\nUser timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  }

  return {
    medications,
    conversationHistory,
    checkReminders,
    addMedication,
    listMedications,
    getMedicationInfo,
  };
}

async function chat(
  app: ReminderApp,
  userMessage: string
): Promise<string> {
  app.conversationHistory.push({
    role: "user",
    content: userMessage,
  });

  const systemPrompt = `You are a helpful medication reminder assistant. You help users manage their medications and set reminders.

Current medications:
${app.getMedicationInfo()}

When users want to add a medication, extract:
- Medication name
- Dosage (e.g., "500mg")
- Frequency (e.g., "twice daily", "every 8 hours")
- Times (e.g., "08:00,20:00" for twice daily)

When asked to add a medication, respond with a JSON block like this:
{
  "action": "add_medication",
  "name": "Aspirin",
  "dosage": "500mg",
  "frequency": "twice daily",
  "times": ["08:00", "20:00"]
}

Otherwise, provide helpful information about medication management, reminders, and health tips. Be friendly and supportive.`;

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    system: systemPrompt,
    messages: app.conversationHistory,
  });

  const assistantMessage =
    response.content[0].type === "text" ? response.content[0].text : "";

  app.conversationHistory.push({
    role: "assistant",
    content: assistantMessage,
  });

  // Parse for medication additions
  try {
    const jsonMatch = assistantMessage.match(/\{[\s\S]*"action"[\s\S]*\}/);
    if (jsonMatch) {
      const actionData = JSON.parse(jsonMatch[0]);
      if (
        actionData.action === "add_medication" &&
        actionData.name &&
        actionData.dosage &&
        actionData.frequency &&
        actionData.times
      ) {
        app.addMedication(
          actionData.name,
          actionData.dosage,
          actionData.frequency,
          actionData.times
        );
        