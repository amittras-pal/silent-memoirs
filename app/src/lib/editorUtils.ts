export function getWordCount(text: string) {
    if(!text || text.trim() === "") return 0;

    return text
        // Remove leading/trailing whitespaces
        .trim()
        // Split by any newline character like spaces, newline, tab etc. 
        .split(/\s+/)
        // Word should contain at least 1 alphanumeric character. 
        // Prevents counting markdown specific syntax like ###, >, --- etc. to be miscounted as words.
        .filter(word => /[a-zA-Z0-9]/.test(word)).length;
}

const EDITOR_PLACEHOLDERS = [
    "What are you carrying in your mind today?",
    "Name one moment from today you want to remember.",
    "What felt heavy today, and what felt light?",
    "Write the truth you are avoiding right now.",
    "What are you grateful for in this exact moment?",
    "If this day had a title, what would it be?",
    "What conversation stayed with you the longest?",
    "What did you learn about yourself today?",
    "What small win deserves to be celebrated?",
    "What are you ready to let go of tonight?",
    "Describe today's mood in three honest sentences.",
    "What do you want future-you to remember from this day?",
] as const;

export function getRandomEditorPlaceholder(): string {
    const randomIndex = Math.floor(Math.random() * EDITOR_PLACEHOLDERS.length);
    return EDITOR_PLACEHOLDERS[randomIndex];
}