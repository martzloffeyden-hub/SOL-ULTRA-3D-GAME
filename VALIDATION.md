# Vérifications réellement effectuées

Environnement : cloud Linux, Node.js 24.19, Chromium système, Playwright Python. Vérification du 22 octobre 2026.

## Résultats

- **12 tests de géométrie et de monde réussis**, exécutés avec `npm test` : intersections continues de segments, sens de franchissement, marge de l’anneau, plans inclinés, contacts sphériques, centres confondus, longueur du lien et cohérence des douze portes, collisions des terrasses, 1 818 points de route dégagés et lever du soleil réinitialisable.
- **34 vérifications navigateur réussies** avec `python tests/browser.py` : chargement WebGL, commandes W/A/Espace/C, accélération, souris, rotation au clavier, collecte, lien resserré, pause/reprise, épines, point de reprise R, mauvaise résonance, douze anneaux validés par la graine, trois livraisons, victoire, rejeu, redimensionnement et reprise persistante après rechargement des jardins II et III.
- **Aucune erreur JavaScript, console ou HTTP** dans cette suite.
- Inspection visuelle de captures du menu, du vol et des écrans de progression ; corrections du filtre de rendu initial, du contraste et de la composition.
- Système Web Audio exécuté dans Chromium : démarrage après interaction, huit événements, trois ambiances, mute et pause/reprise sans erreur. L’équilibre sonore n’a pas fait l’objet d’une écoute humaine.
- Serveur `npm start` effectivement lancé : page et modules HTTP 200, ressource absente HTTP 404.
- Syntaxe des modules JavaScript vérifiée avec Node.

## Méthode de parcours navigateur

La suite `browser.py` utilise de vrais événements clavier et souris. Le mode QA, uniquement disponible sur localhost avec `?qa=1`, positionne le joueur à l’approche de certains défis et avance la simulation normale à 120 Hz. Les douze anneaux sont validés par l’intersection réelle de la trajectoire de la graine avec leur plan ; aucun compteur n’est forcé. Ce test accéléré n’est pas une partie manuelle complète.

## Parcours continu supplémentaire

`python tests/journey.py` a également atteint la victoire depuis le début sans aucun placement artificiel : **21 contrôles**, trois graines, douze anneaux, trois livraisons et rejeu. Seule la fonction QA `step` accélère la physique ; toutes les commandes passent par les événements de touches et les boutons. Le trajet mesuré couvre **227.313 mètres**, avec une collision naturelle récupérée sans blocage et un lien de longueur maximale 2,724 mètres. Il s’agit d’un pilotage automatique de la simulation, pas d’une partie manuelle en temps réel.

## Performance : mesure et limites

Après quatre secondes de chauffe : **20 images en 5.207 secondes, soit 3.84 images/s**, avec **SwiftShader Vulkan sur CPU**, fenêtre 1440×900, rendu interne 936×585, environ 200 appels de rendu et 87 424 triangles. Le rendu logiciel reste lent. Aucun résultat de performance sur GPU matériel n’a été mesuré, et aucune promesse de 60 FPS n’est faite.

Le post-traitement coûteux a été retiré ; les matériaux lumineux et sprites conservent l’atmosphère. Les décors sont instanciés, les éléments de jeu futurs sont masqués et la résolution s’adapte automatiquement. Il faut néanmoins tester sur le navigateur et le matériel de destination pour évaluer leur fluidité réelle.

Le rapport machine et les captures sont produits dans `test-output/` lors de l’exécution des tests.

## Correction de caméra — version 1.0.1

La vue utilise désormais une vraie orbite horizontale et verticale, avec un sens horizontal conventionnel. La rotation répond directement à l’entrée ; seul le suivi de la position du vaisseau est amorti. Un clic capture le pointeur ; Échap le libère et met en pause. La pause propose une sensibilité de 0,4× à 2× et une inversion verticale, sauvegardées dans le navigateur. Le glisser reste disponible quand une iframe ou le navigateur refuse la capture.

**17 vérifications supplémentaires réussies** avec `python tests/camera.py`, en utilisant une capture native réelle dans Chromium : droite/haut, cohérence entre vol et vue, orbite de 11,6 unités, absence de retard angulaire, limites verticales, Échap, reprises répétées, réglages, persistance, refus de capture dans une iframe et nettoyage du glisser après relâchement ou annulation. Aucune erreur JavaScript non interceptée ; les refus de capture provoqués volontairement dans l’iframe sont consignés séparément dans `test-output/camera-report.json`.
