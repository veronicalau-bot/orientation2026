/**
 * Compresses an image client-side to keep it under 1MB.
 * Restricts maximum dimension to 1280px or 720px equivalent,
 * and maintains proper aspect ratio.
 */
export function compressImage(file: File): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Selected file is not an image."));
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        
        // Target boundary resolution: Max width/height limit 1280px
        const MAX_DIM = 1280;
        
        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not construct 2D context."));
          return;
        }
        
        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.75 compression utility
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        const base64 = dataUrl.split(",")[1];
        
        resolve({
          base64,
          mimeType: "image/jpeg",
          dataUrl
        });
      };
      
      img.onerror = (err) => reject(err);
    };
    
    reader.onerror = (err) => reject(err);
  });
}
