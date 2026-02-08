import { GoogleGenAI } from "@google/genai";
import { SceneGraph } from "../types";

/** Convert ArrayBuffer to base64 string (browser-safe, no Node Buffer). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const DEBUG_DISABLE_GEMINI = true;

let ai: GoogleGenAI | null = null;
if (!DEBUG_DISABLE_GEMINI) {
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
} else {
  ai = null;
}

/** Low-cost classification: is the prompt a scene description (sky/terrain/atmosphere) or a list of objects? */
export type PromptKind = "scene" | "object";

export const classifyPrompt = async (prompt: string): Promise<PromptKind> => {
  if (prompt.includes("scene")) return "scene";
  return "object";
  //   const response = await ai.models.generateContent({
//     model: "gemini-2.0-flash",
//     contents: {
//       parts: [{
//         text: `You are a classifier. Reply with exactly one word: "scene" or "object".
// - "scene": the user describes an environment, atmosphere, sky, terrain, or overall mood (e.g. "sunset over mountains", "neon cyberpunk city sky").
// - "object": the user describes a list of things, items, or objects to place in a scene (e.g. "a red tree and a blue sphere", "three crystals and a tower").

// User input: "${prompt.slice(0, 500)}"

// Reply only: scene OR object`
//       }]
//     },
//     config: { maxOutputTokens: 10 }
//   });
//   let raw = (response as { text?: string }).text?.trim().toLowerCase() ?? "";
//   if (!raw && response.candidates?.[0]?.content?.parts?.[0]) {
//     const part = response.candidates[0].content.parts[0];
//     raw = ((part as { text?: string }).text ?? "").trim().toLowerCase();
//   }
//   if (raw.includes("object")) return "object";
//   return "scene";
};

// /** Convert ArrayBuffer to base64 string (browser-safe, no Node Buffer). */
// function arrayBufferToBase64(buffer: ArrayBuffer): string {
//   const bytes = new Uint8Array(buffer);
//   let binary = "";
//   for (let i = 0; i < bytes.byteLength; i++) {
//     binary += String.fromCharCode(bytes[i]);
//   }
//   return btoa(binary);
// }


export const parseScenePrompt = async (prompt: string): Promise<SceneGraph> => {
  // const response = await ai.models.generateContent({
  //   model: 'gemini-3-flash-preview',
  //   contents: `Analyze the following scene description, extract the objects and their properties, and convert it into a scene graph. 
  //   Description: "${prompt}"`,
  //   config: {
  //     responseMimeType: "application/json",
  //     responseSchema: {
  //       type: Type.OBJECT,
  //       properties: {
  //         objects: {
  //           type: Type.ARRAY,
  //           items: {
  //             type: Type.OBJECT,
  //             properties: {
  //               id: { type: Type.STRING },
  //               type: { type: Type.STRING, description: "One of: sphere, box, cylinder, torus, tree, cloud, mushroom" },
  //               position: { 
  //                 type: Type.ARRAY, 
  //                 items: { type: Type.NUMBER },
  //                 description: "[x, y, z] - x: -50 to 50, y: 0 to 20, z: -100 to 0"
  //               },
  //               scale: { 
  //                 type: Type.ARRAY, 
  //                 items: { type: Type.NUMBER },
  //                 description: "[x, y, z]"
  //               },
  //               color: { type: Type.STRING, description: "Hex color" },
  //               rotation: { 
  //                 type: Type.ARRAY, 
  //                 items: { type: Type.NUMBER },
  //                 description: "[x, y, z]"
  //               },
  //               name: { type: Type.STRING },
  //               maxPoints: { type: Type.NUMBER, description: "Number of points in the point cloud (1000-5000)" }
  //             },
  //             required: ["id", "type", "position", "scale", "color", "rotation", "name", "maxPoints"]
  //           }
  //         }
  //       },
  //       required: ["objects"]
  //     }
  //   }
  // });
  // console.log(response);
  // return JSON.parse(response.text.trim()) as SceneGraph;
  const response = '{"objects": [{"id": "tree_01","type": "sakura-tree","position": [-25, 0, -45],"scale": [3, 3, 3],"color": "#2D5A27","rotation": [0, 0, 0],"name": "Left Side Tree","maxPoints": 2500},{"id": "tree_02","type": "sakura-tree","position": [25, 0, -45],"scale": [3, 3, 3],"color": "#2D5A27","rotation": [0, 0, 0],"name": "Right Side Tree","maxPoints": 2500},{"id": "bell-tower","type": "bell-tower","position": [0, 0, -60],"scale": [2, 2, 2],"color": "#FF4500","rotation": [0, 0, 0],"name": "Floating Red Ball","maxPoints": 1500},{"id": "sphere_02","type": "church","position": [40, 0, 10],"scale": [2.5, 2.5, 2.5],"color": "#1E90FF","rotation": [0, 0, 0],"name": "Floating Blue Ball","maxPoints": 1500}]}';
  return JSON.parse(response) as SceneGraph;
};

export const generateSkyTexture = async (ambience: string): Promise<string> => {
  if (!DEBUG_DISABLE_GEMINI) {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `A surreal, dreamy, ethereal sky texture for a ${ambience} scene. High resolution, vibrant but soft colors, nebula-like.` }]
      },
      config: {
        imageConfig: { aspectRatio: "16:9" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return '';
  } else {
    
    // TODO: This is temparay sample image
    const imageURL = "https://i.imgur.com/Glzh0By.png";
    // load the image from the URL
    const image = await fetch(imageURL);
    const imageData = await image.arrayBuffer();
    const base64Image = arrayBufferToBase64(imageData);
    
    const partData = {
      inlineData: { 
        "mimeType": "image/png",
        "data": base64Image
      }
    };
    return `data:${partData.inlineData.mimeType};base64,${partData.inlineData.data}`;
  }
};

export const generateTerrainTexture = async (ambience: string): Promise<string> => {
  if (!DEBUG_DISABLE_GEMINI) {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `A seamless tiled ground texture for a ${ambience} dream world. Subtle patterns, glowing veins, or soft textures.` }]
      },
      config: {
        imageConfig: { aspectRatio: "1:1" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return '';
  } else {
    // TODO: This is temparay sample image
    const imageURL = "https://i.imgur.com/kaUgiz6.jpeg";
      // load the image from the URL
    const image = await fetch(imageURL);
    const imageData = await image.arrayBuffer();
    const base64Image = arrayBufferToBase64(imageData);

    const partData = {
        inlineData: { 
          "mimeType": "image/png",
          "data": base64Image
        }
    };
    return `data:${partData.inlineData.mimeType};base64,${partData.inlineData.data}`;
  }
};
