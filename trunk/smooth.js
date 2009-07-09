/*

Copyright 2009 Google Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*/ 

/**
 * @fileoverview Manages simultaneous animations over DOM properties (or
 *     anything else JavaScript can get at, really).
 * @author mjhecht@gmail.com (Michael Hecht)
 */

(function() {

	// Minimum amount of time between calls to the animation loop. A larger
	// number produces choppier animations.
	var ANIMATION_SLICE_MS = 10;
	
	// Array of objects, each of which represents an animation.
	var animations = [];
	
	// Handle to timer, which allows cancelling a scheduled callback. 
	var timerId;
	
	// Flags whether the animation array has been sorted.
	var sorted;

	/**
	 * Custom sort for the animation array. Orders animations by their start
	 * time, so they're executed in a controlled order, and for optimization
	 * purposes so we can stop checking the animation list if the start time
	 * is in the future.
	 * @private
	 * @param {Object} a Object containing animation parameters.
	 * @param {Object} b Object containing animation parameters.
	 * @return {number} Comparison result for JS sort spec. 
	 */
	function animationSorter(a, b) {
		// Prioritize property-less animations (i.e., callback animations) higher
		// than property animations to ensure set-up functions are run first.
		if (a.startTime == b.startTime) {
			return a.property ? 0 : 1;
		}
		return (a.startTime - b.startTime);
	}

	/**
	 * Close up holes in the animation array that were formed when an animation
	 * ended and was deleted.
	 * @private
	 */
	function defragmentAnimations() {
		var old = animations;
		animations = [];
		for (var i = 0; i < old.length; ++i) {
			if (old[i] != null) {
				animations.push(old[i]);
			}
		}
	}

	/**
	 * Allows animateProperty() to be called repeatedly to build up multiple
	 * animations without requiring animate() afterwards. We simply cancel
	 * running animationLoop() until all animations are added.
	 * Since new animations may be added before animationLoop() is called,
	 * we'll flag whether a new sorting pass is needed rather than sorting
	 * either (1) on each loop, or (2) on each animation added.
	 * @private
	 */
	function animate() {
		sorted = false;
		
		if (timerId) {
			window.clearTimeout(timerId);
			timerId = null;
		}
		timerId = window.setTimeout(animationLoop, 0);
	}

	/**
	 * Forces the animation loop to run right now, but cancels any timers
	 * created by animate() before doing this (to prevent unnecessary or
	 * duplicated runs of the animation loop.
	 */
	function animateNow() {
		sorted = false;
	
		if (timerId) {
			window.clearTimeout(timerId);
			timerId = null;
		}
		animationLoop();
	}

	/**
	 * Animation loop. Goes through the array of animations and services
	 * each one if it is within its window. Schedules the next run of
	 * animationLoop(). If currently within any animation window, then the
	 * next run will be as soon as possible (after the minimum delay); if not,
	 * then the next run is scheduled according to the next upcoming animation.
	 * If there are no more animations, the loop is not rescheduled.
	 * @private 
	 */
	function animationLoop() {
		var now = (new Date()).valueOf();
		var active = false;
		var defrag = false;
		
		if (!sorted) {
			animations.sort(animationSorter);
			sorted = true;
		}
		
		for (var i = 0; i < animations.length; ++i) {
			var ani = animations[i]; // Current animation from the queue.
			try {
				if (ani.startTime > now) {
					// Since animations are sorted by start time, there won't be any more
					// current animations found in this loop.
					break;
				}				
				if (ani.endTime <= now) {
					// This animation has passed or is at its endpoint.
					if (ani.property) {
						ani.object[ani.property] = ani.interpolator ? ani.interpolator(
							ani.startValue,
							ani.targetValue,
							1,
							ani.timeline
						) : ani.targetValue;
					} else if (typeof(ani.targetValue) == 'function') {
						ani.targetValue(ani.object, now);
					}
					animations[i] = null;
					defrag = true;
					continue;
				}
	
				// We're between the two endpoints of the animation timeline.
				var duration = ani.endTime - ani.startTime;
				if (ani.property) {
					ani.object[ani.property] = ani.interpolator(
						ani.startValue,
						ani.targetValue,
						(now - ani.startTime) / duration,
						ani.timeline
					);
					active = true;
				}
			} catch(e) {
				// If an exception occurs, something's wrong with the current animation;
				// just delete it. Nothing mission critical, here.
				animations[i] = null;
				defrag = true;
			}
		}

		if (defrag) {
			defragmentAnimations();
		}

		if (active) {
			timerId = window.setTimeout(animationLoop, ANIMATION_SLICE_MS);
		} else if (animations.length > 0) {
			timerId = window.setTimeout(animationLoop, animations[0].startTime - now);
		}
		// If no more animations and nothing is active, we just don't rescheduled
		// animate().
	}

	/**
	 * Animate any object property.
	 * @public
	 * @param {Object} element A DOM node to which this animation is attached.
	 *     Used so that the animation can be cancelled if this DOM node is
	 *     removed.  
	 * @param {Object} object Any object, but usually will be a DOM node.
	 * @param {string} property Name of the object's property to animate.
	 * @param {*} startValue Starting value for property.
	 * @param {*} targetValue Target value for property, at the animation's end.
	 * @param {number} delay Seconds before animation should begin.
	 * @param {number} duration Duration of animation once begun, in seconds.
	 * @param {string} interpolator Name of property within interpolators object,
	 *     specifying a function which knows how to parse and set the units
	 *     being used for the property being animated.
	 * @param {string} timeline Name of property within timelines object,
	 *     specifying a function which the interpolator uses to map progress
	 *     over animation duration to progress over value range.
	 * @param {boolean} opt_restore Restore the original value of the animated
	 *     property when the animation ends?
	 * @param {number} opt_hold Hold targetValue for this additional number of
	 *     seconds before restoring the original value of the animated property.
	 */
	function animateProperty(
			element, object, property, startValue, targetValue, delay, duration,
			interpolator, timeline, opt_restore, opt_hold) {
			
		var startTime = (new Date()).valueOf() + delay*1000;
		var endTime = startTime + duration*1000;
		var animationProperties = {
			element: element,
			object: object,
			property: property,
			startValue: startValue,
			targetValue: targetValue,
			startTime: startTime,
			endTime: endTime,
			interpolator: ((typeof interpolator == 'function') ?
					interpolator : interpolators[interpolator]),
			timeline: timelines[timeline]
		};
		animations.push(animationProperties);

		if (opt_restore) {
			opt_hold = opt_hold || 0;
			animations.push({
				element: element,
				object: object,
				property: property,
				startValue: null,
				targetValue: object[property],
				startTime: opt_hold*1000 + endTime + 1,
				endTime: opt_hold*1000 + endTime + 1
			});
		}

		animate();
		return animationProperties;
	};

	/**
	 * Animate a property using a list of discrete values, which will be
	 * stretched across the duration of the animation.
	 * @public
	 * @param {Element} element DOM Element to associate with this animation.
	 * @param {Object} object Object whose property to animate.
	 * @param {string} property Name of the property to animate.
	 * @param {Array} values List of discrete values that the property
	 *     will take on.
	 * @param {number} delay Seconds to wait before starting the animation.
	 * @param {number} duration Length of the animation, in seconds.
	 * @param {boolean} opt_restore Restore the original value of the animated
	 *     property when the animation ends?
	 * @param {number} opt_hold Hold the last value in the list for this
	 *     additional number of seconds before restoring the original value.
	 */
	function animatePropertyDiscrete(element, object, property, values, delay,
			duration, opt_restore, opt_hold) {

		function interpolator(start, end, position, timeline) {
			var pos = timeline(start, end, position);
			return values[Math.round(pos * (values.length - 1))];
		}

		animateProperty(element, object, property, 0, 1, delay, duration,
				interpolator, 'linear', opt_restore, opt_hold);
	}

	/**
	 * Wrapper for animateProperty() which simplifies setting a property to a
	 * value after some amount of time.
	 * @public
	 * @param {Object} object Any object, but usually will be a DOM Node.
	 * @param {string} property Name of the object's property to animate.
	 * @param {*} targetValue Target value for property.
	 * @param {number} delay Seconds before setting property.
	 * @param {boolean} opt_restore Restore the initial value of the property.
	 * @param {number} opt_hold Hold property for this number of
	 *     seconds before restoring the initial value.
	 */
	function delaySetProperty(element, object, property, targetValue, delay,
			opt_restore, opt_hold) {
		animateProperty(element, object, property, targetValue,
				targetValue, delay, 0, null, null, opt_restore, opt_hold);
	}

	/**
	 * Pads a string to two characters if its length is one character.
	 * Used by color interpolators.
	 * @private
	 * @param {string} str One- or two-character string, or a number which
	 *   can be cast as such. 
	 * @return {string} The above string padded to two characters.
	 */
	function pad2(str) {
		if (str.length < 2) {
			return '0' + str;
		}
		return str;
	}

	/**
	 * Schedules a callback to be run after a certain amount of time. If
	 * a cleanup callback is given, it will be run after an additional
	 * number of seconds.
	 * @public
	 * @param {Element} element DOM Element to associate with this animation.
	 * @param {Object} object Object whose property to animate.
	 * @param {Function} callback Function to call after a delay.
	 * @param {number} delay Seconds to wait before starting the animation.
	 * @param {Function} opt_callback_cleanup Additional function to run,
	 *     to clean up / tear down whatever was set up by the first function.
	 * @param {number} opt_hold Hold the state of the animation for this many
	 *     seconds before running opt_callback_cleanup().
	 */
	function scheduleAction(element, object, callback, delay,
			opt_callback_cleanup, opt_hold) {
		animateProperty(element, object, null, null, callback, delay, 0);

		if (opt_hold) {
			var runTime = (new Date()).valueOf() + delay*1000;
			var cleanupTime = runTime + opt_hold*1000;
			animations.push({
				element: element,
				object: object,
				targetValue: opt_callback_cleanup,
				startTime: cleanupTime,
				endTime: cleanupTime
			});
		}

		animate();
	}

	/**
	 * Repeats an action a specified number of times.
	 * @param {Element} element The element associated with the action.
	 * @param {Object} object An object to pass to the callback.
	 * @param {Function} callback Function to call each repetition, with this
	 *   signature: callback(i, isInInterval), where i is the iteration number,
	 *   starting at 0, and isInInterval is false if the callback is "late"
	 *   according to the wall-clock and will immediately be called again.
	 * @param {number} delay Seconds to wait before the first run.
	 * @param {number} interval Seconds between each subsequent run.
	 * @param {number} times Number of times to trigger the action.
	 */
	function repeatAction(element, object, callback, delay, interval, times) {
		var nextTime = (new Date()).valueOf() + delay * 1000;		
		var i = 0;
		
		(function eachTime(object, now) {
			if (i > 0) {
				callback(i - 1, now < nextTime);
			}
			if (i < times) {
				animations.push({
					element: element,
					object: object,
					startTime: nextTime,
					endTime: nextTime,
					targetValue: eachTime
				});
				
				nextTime = nextTime + interval * 1000;
				animate();
			}			
			i++;
		})();
	}

	/**
	 * Is one element an ancestor of another?
	 * @private
	 * @param {Element} old The DOM element closer to the root which
	 *     we're checking is an ancestor of the younger element.
	 * @param {Element} young The DOM element we're checking is a
	 *     descendant of the older element.
	 * @return {boolean} True if old is an ancestor of young.
	 */
	function isAncestorOrSelf(old, young) {
		try {
			var cur = young;
			do {
				if (cur == old) {
					return true;
				}
			} while (cur = cur.parentNode);
			return false;
		} catch(e) {
			return false;
		}
	}
	

	/**
	 * Ends all currently running animations, by making each animation
	 * think that we're past its envelope's endpoint. This forces each
	 * animation to run and perform any cleanup that's part of its cycle;
	 * it will then be removed from the list of animations. Executes immediately
	 * within the current thread (i.e., does not call setTimeout).
	 * @public
	 */
	function endAllAnimations() {
		var now = (new Date()).valueOf();
		for (var i = 0; i < animations.length; ++i) {
			var cur = animations[i];
			cur.startTime = now - 1;
			cur.endTime = now;
		}
		animateNow(); // Finish all animations in current order.
	}

	/**
	 * Ends all animations which reference elements below the given element
	 * in the DOM. Like endAllAnimations (see comments for that) but pickier.
	 * @public
	 * @param {Element} element DOM Each animation is checked to see if this
	 *   element is within its parentNode chain; if so, it is ended.
	 */
	function endAnimations(element) {
		animateNow(); // Run through all animations at current stage.
		var now = (new Date()).valueOf();
		for (var i = 0; i < animations.length; ++i) {
			var cur = animations[i];
			if (isAncestorOrSelf(element, cur.element)) {
				cur.startTime = now;
				cur.endTime = now;
			}
		}
		animateNow(); // Finish all object-descendent animations in current order.
	}


	/**
	 * Convert any string which specifies a color into rgb6 (#nnnnnn) notation.
	 * @public
	 * @param {string} rgb String representing a color. Currently handles rgb3
	 *     and rgb(x, y, z) notation, where x, y, z are 0 through 255.
	 * @return {string} rgb6 representation of the color. If the function
	 *     doesn't understand the notation, the original value is just
	 *     returned.
	 */
	function parseRgb(rgb) {
		if (rgb.indexOf('rgb') == 0) {
			segs = rgb.split(/[^0-9]+/);
			return '#' +
					pad2(parseInt(segs[1]).toString(16)) +
					pad2(parseInt(segs[2]).toString(16)) +
					pad2(parseInt(segs[3]).toString(16));
		} else if (rgb.length == 4) {
			return '#' +
					rgb.charAt(1) + '0' + rgb.charAt(2) + '0' + rgb.charAt(3) + '0';
		} else {
			return rgb;
		}
	}

	/**
	 * Converts a string which gives magnitude in pixels, with units, to a number.
	 * @public
	 * @param {string} px Magnitude in HTML style notation.
	 * @return {number} Number of pixels specified by the string, or 0.
	 */
	function parsePx(px) {
		if(!px) return 0;
		if (typeof(px) == 'number') return px;
		return parseInt(px.replace('px', ''));
	}

	/**
	 * Timelines bend the rate at which time flows between the endpoints of
	 * an animation, and are responsible for actually doing the math to
	 * interpolate between two values at a given weighting between them.
	 * For all of these timeline functions, the following
	 * parameters and return values apply.
	 * @public
	 * @param {number} v0 Lowest value (start point).
	 * @param {number} v1 Highest value (end point).
	 * @param {number} pos Current position, normalized (between 0 and 1).
	 * @return {number} Average of v0 and v1, weighted by pos according to
	 *     the type of timeline.
	 */
	var timelines = {
		linear: function(v0, v1, pos) {
			return v0 * (1 - pos) + v1 * pos;
		},

		// Graph the following parabola as x varies from 0 to 1:
		// y = 1 - (x - 1)^2.
		decelerate: function(v0, v1, pos) {
			pos = 1 - (pos - 1) * (pos - 1);
			return v0 * (1 - pos) + v1 * pos;
		},
		
		// Slow-in and slow-out.
		sine: function(v0, v1, pos) {
			var rads = Math.PI/2;
			var scomp = Math.sin(pos * rads);
			var ccomp = 1 - Math.sin(rads + pos * rads);
			var pos = ccomp * (1 - pos) + scomp * pos;

			return v0 * (1 - pos) + v1 * pos;
		}
	};

	/**
	 * Interpolators understand different types of values and know how to
	 * calculate an intermediate value between two values of that type.
	 * The intermediate value is calculated using the given timeline,
	 * and need not be the same type as the two input values.
	 * @public
	 * @param {*} param1 The first value.
	 * @param {*} param2 The second value.
	 * @param {number} Completeness of animation, between 0 and 1.
	 * @param {Function} timeline Timeline function used to calculate
	 *     the weighted average of two values.
	 * @return {*} Interpolated value between param1 and param2.
	 */
	var interpolators = {
		rgb3: function(color0, color1, position, timeline) {
			var i, result = '', digit0, digit1, newvalue, newdigit;
			for (i = 1; i < 4; ++i) {
				digit0 = parseInt(color0.charAt(i), 16);
				digit1 = parseInt(color1.charAt(i), 16);

				newvalue = Math.round(timeline(digit0 * 16, digit1 * 16, position));

				result += pad2(newvalue.toString(16));
			}
			return '#' + result;
		},
		rgb6: function(color0, color1, position, timeline) {
			var i, result = '', digit0, digit1, newvalue, newdigit;
			for (i = 0; i < 3; ++i) {
				digit0 = parseInt(color0.substr(i*2+1,2), 16);
				digit1 = parseInt(color1.substr(i*2+1,2), 16);

				newvalue = Math.round(timeline(digit0, digit1, position));

				result += pad2(newvalue.toString(16));
			}
			return '#' + result;
		},
		number: function(num0, num1, position, timeline) {
			return timeline(num0, num1, position);
		},
		integer: function(num0, num1, position, timeline) {
			return Math.round(timeline(num0, num1, position));
		},
		px: function(px0, px1, position, timeline) {
			return Math.round(timeline(parsePx(px0), parsePx(px1), position)) + 'px';
		},
		
		// Used for setting transparency in Internet Explorer.
		filter: function(num0, num1, position, timeline) {
			return 'alpha(opacity=' + timeline(num0*100, num1*100, position) + ')';
		}
	};

	// Export public symbols into global namespace.
	window.scheduleAction = scheduleAction;
	window.repeatAction = repeatAction;
	window.animateProperty = animateProperty;
	window.animatePropertyDiscrete = animatePropertyDiscrete;	
	window.endAnimations = endAnimations;
	window.endAllAnimations = endAllAnimations;
	window.delaySetProperty = delaySetProperty;
	window.parseRgb = parseRgb;
	window.parsePx = parsePx;

	// Set references to allow users to add custom interpolators
	// and timelines.
	window.animateProperty.interpolators = interpolators;
	window.animateProperty.timelines = timelines;

})();
