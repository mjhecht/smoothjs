# SmoothJS Quick-Start #

First, the basics, of course. Download the file "smooth.js" and reference it anywhere in your HTML file:

```
  <script src="smooth.js"></script>
```

Most functionality you'll ever want is provided by the globally accessible `animateProperty(...)`, which you can call from any script block. Here's an explanation of the function's arguments.

## Global function: animateProperty(...) ##

### Signature ###

```
function animateProperty(element, object, property, startValue, targetValue,
  delay, duration, interpolator, timeline, opt_restore, opt_hold);			
```

### Explanation of Arguments ###

  * **element**: (Object) A reference to a DOM node to which this animation is attached. Not required, but useful so that an animation can be targeted and cancelled if this DOM node (or one of its ancestors) is removed.
  * **object**: (Object) The object whose property to animate.
  * **property**: (string) Name of the property to animate.
  * **startValue**: Starting value for the property. Can be any JS type.
  * **targetValue**: Ending value for the property. Can be any JS type.
  * **delay**: (number) Seconds to wait before the animation begins.
  * **duration**: (number) Duration of the animation, in seconds.
  * **interpolator**: (string) The name of an internal function which knows how to take weighted averages of the type in the property being animated. For example, the 'rgb6' interpolator knows how to average two arbitrary colors given in '#rrggbb' notation as used in CSS. Out-of-the-box interpolators are: 'rgb3', 'rgb6', 'number', 'integer', 'px', and 'filter'.
  * **timeline**: (string) The name of an internal function which controls the rate at which time flows between an animation's endpoints. Provided timelines:
    * 'linear': The standard. Does what you'd expect.
    * 'decelerate': Starts out fast, then slows down towards the animation's completion. The timeline looks like an upside-down parabola, with its peak at the animation's end.
    * 'sine': Slow-in, slow-out. The timeline looks like a sine wave.
  * opt\_restore: (boolean, optional) Additionally, when the animation is done, should the original property value be restored?
  * opt\_hold: (number, optional) A number of seconds to retain the achieved target value before the original value is restored (above).

### Example ###

```
<script>
  var el = document.getElementById('some-element-id');
  animateProperty(el, el.style, 'backgroundColor', '#fff', '#000', 0.0, 0.5, 'rgb3', 'linear', true, 0.5);
</scrit>
```

Linearly animates the CSS 'background-color' property of an element from white to black, starting immediately, over a duration of 0.5 seconds. The element stays black for an extra 0.5 seconds, then the original color (not necessarily white; whatever it was before the animation began) is restored.