// Shared, portable presets. Standard preserves the existing render path.
const PRESETS=Object.freeze({
 standard:Object.freeze({cpuSamples:8,bounces:12,scale:1,shadowSize:1024,crf:19,preset:'veryfast',bitrateScale:1}),
 high:Object.freeze({cpuSamples:64,bounces:12,scale:1.5,shadowSize:2048,crf:16,preset:'slow',bitrateScale:1.5}),
 ultra:Object.freeze({cpuSamples:256,bounces:12,scale:2,shadowSize:4096,crf:14,preset:'slow',bitrateScale:2}),
});
export function renderSettings(timeline={}){
 const quality=timeline.renderQuality??'standard',preset=PRESETS[quality];
 if(!preset)throw new Error(`Unknown render quality: ${quality}`);
 return {quality,...preset};
}
