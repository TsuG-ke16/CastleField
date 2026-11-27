// Build UI geometry once; never generates or changes gameplay data.
import{readFileSync,writeFileSync}from'node:fs';
import{edgeList,nodeKind}from'./skillTreeModel.js';
import{treeIndex}from'../game/SkillTree.js';
import{TREE_LAYOUT}from'./skillTreeLayout.js';
import{routeCurve}from'./skillTreeRoutes.js';
const tree=JSON.parse(readFileSync(new URL('../../data/classic/skilltree.json',import.meta.url))),ix=treeIndex(tree);
const radius=id=>{const kind=nodeKind(ix.byId.get(id)??null);return {start:42,normal:26,ultimate:40,cross:23}[kind]*(kind==='ultimate'?1.35:1)+5};
const paths=Object.fromEntries(edgeList(tree).map(([a,b])=>[[a,b].sort().join(':'),routeCurve(a,b,TREE_LAYOUT.positions,radius)]));
writeFileSync(new URL('./skillTreePaths.js',import.meta.url),'// Generated UI-only curves. Run node js/ui/build-skilltree-paths.js after layout changes.\nexport const TREE_PATHS = '+JSON.stringify(paths)+';\n');
console.log(Object.keys(paths).length+' UI routes compiled');
