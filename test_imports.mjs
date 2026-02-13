try {
    console.log("Attempting to import jspdf...");
    const jsPDF = await import('jspdf');
    console.log("jspdf imported successfully");

    console.log("Attempting to import html2canvas...");
    const html2canvas = await import('html2canvas');
    console.log("html2canvas imported successfully");
} catch (e) {
    console.error("Import failed:", e.message);
}
