I want to have a unit/course browser where users can see public courses/units and add them to their "My units" in the /units page. There will be 2 options to add them: 1. manually clicking an "Add to my courses" button in the unit browser 2. by clicking in the unit/course you start practicing and this adds it to your units with the adequate progress.

I also need a button "make public" that will make a course/unit public. Add a warning explaining that this decision is irreversible and all unsers will have access to this and that your name will be shows as the author. For ADMIN_EMAILS users show a "make private" button that allows them to make any public course/unit private.

We also need to gracefully ignore parser failures. Right now if a unit fails to parse the entire /unit page breaks. If a unit cannot be parsed, show a red "Unit can't be parsed" badge and don't allow the user to try to open it, show the unit with inactive feel/look.
