/**
 * Every component stylesheet, loaded up front in the order the single-bundle build had them (performance, route splitting).
 * Pages are split into lazy chunks (platform/routeChunks.ts); without this file their CSS would load later and land AFTER
 * styles.css / ui-states.css / runon.css, changing which rule wins. Importing them here (main.tsx, just before App) keeps the
 * cascade byte-for-byte the same as before the split. A new component stylesheet belongs in this list, at its place.
 */
import './shared/openmodels.css';
import './ui/mascot.css';
import './ui/mascotMood.css';
import './platform/settings.css';
import './ui/pages/presets.css';
import './shared/featureCredit.css';
import './shared/gentile.css';
import './shared/workflow.css';
import './shared/sharecard.css';
import './shared/resultViewer.css';
import './ui/b1/canvasBits.css';
import './shared/setupCard.css';
import './shared/modelMenu.css';
import './shared/modelHoverCard.css';
import './ui/next/imageCanvas.css';
import './ui/next/workflowBar.css';
import './ui/next/maskSheet.css';
import './ui/next/feed/feed.css';
import './ui/pages/assets.css';
import './shared/splitPreview.css';
import './ui/pages/workflows.css';
import './ui/pages/models.css';
import './tools/imageApps/imageUpscale.css';
import './shared/failureState.css';
import './ui/next/presetChip.css';
