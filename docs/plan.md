# Refactoring the result view

## Concern

Current view is dense and overwhelming requiring many scrolls to read through every section(the score section, risk radar, blind spot bars, action plan and deep dive prompt). On top of that,it doesn't feel right to me putting these sections together in a same view because they actually cover multiple aspects that should be put in different scopes: score, risk radar and bars reveal the user's level at the moment while action plan and deep dive prompt tell users what should be done in the future. So from a time-wise perspective, it would make more sense to remove action plan and deep dive prompt from the result view.

## Refactoring approaches

As the result view only preserves score, risk radar and blind spot bars, there should be buttons for launching action plan and deep dive prompt, both of which have their own dedicated window. So, the whole screen may look like a desktop with 3 opened program.

## Imagined Scenario

### Quiz taken on desktop devices

When the quiz is finished, analysis delivered(result views) as well as icons, resembling desktop program shortcuts, of action plan and deep dive prompt. And there should already be a quiz shortcuts on desktop, it was there since the user's first landing on the website. This creates a rich retro OS experience.

### Quiz taken on mobile devices

I am not sure how to modify the layout above since there are limited visual budget on mobile devices, where the mock desktop barely shows up, blocking by the question window throughout the experience. Anyway, even though desktop shortcut icons are unnoticeable to users, it is still necessary to make action plan and deep dive prompt their own dedicated windows/panels.

### Details

Windows of different content are allowed to stack on top of each other, positioning at higher layer whichever is active. That's how a real OS renders programs.

Another essential element is the program block populated in the task bar. User should notice there are multiple window to play with and it's possible to switch between different window, again mimicking a real OS's behaviour.
